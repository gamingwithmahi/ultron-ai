require("dotenv").config();
const express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),path=require("path"),fs=require("fs"),crypto=require("crypto");
const {generateAssistantReply}=require("./lib/ai-provider");
const {Pool}=require("pg");
const {runMigrations,syncProjection}=require("./lib/db-migrations");
const {createJobWorker}=require("./lib/job-worker");
const googleOAuth=require("./lib/google-oauth");
const app=express(),PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||"0.0.0.0";
const DATA_DIR=path.join(__dirname,"data"),STORE_FILE=path.join(DATA_DIR,"store.json"),SESSION_TTL=8*60*60*1000,SECURE=process.env.NODE_ENV==="production";
const sessions=new Map(),startedAt=Date.now();let store={version:1,admin:null,approvals:[],audit:[],tasks:[],memories:[],notifications:[]},writeQueue=Promise.resolve();
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==="disable"?false:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
app.disable("x-powered-by");app.set("trust proxy",process.env.TRUST_PROXY==="true"?1:false);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:null}}}));
app.use(express.json({limit:"24kb"}));app.use("/api",rateLimit({windowMs:15*60*1000,limit:180,standardHeaders:"draft-7",legacyHeaders:false}));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"Too many authentication attempts. Try again later."}});
const chatLimiter=rateLimit({windowMs:15*60*1000,limit:25,standardHeaders:"draft-7",legacyHeaders:false});
async function persist(){const snapshot=JSON.stringify(store),data=JSON.parse(snapshot);writeQueue=writeQueue.catch(()=>{}).then(async()=>{if(pool){const client=await pool.connect();try{await client.query("BEGIN");await client.query("INSERT INTO ultron_state (id,payload,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",[snapshot]);await syncProjection(client,data);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}return}await fs.promises.mkdir(DATA_DIR,{recursive:true});const tmp=STORE_FILE+".tmp";await fs.promises.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await fs.promises.rename(tmp,STORE_FILE)});return writeQueue}
async function load(){if(pool){await runMigrations(pool);const result=await pool.query("SELECT payload FROM ultron_state WHERE id=1");if(result.rowCount){store={...store,...result.rows[0].payload};store.notifications=Array.isArray(store.notifications)?store.notifications:[];await persist()}else await persist()}else{await fs.promises.mkdir(DATA_DIR,{recursive:true});try{const x=JSON.parse(await fs.promises.readFile(STORE_FILE,"utf8"));store={...store,...x};if(!Array.isArray(store.approvals)||!Array.isArray(store.audit))throw Error("Invalid data store");store.tasks=Array.isArray(store.tasks)?store.tasks:[];store.memories=Array.isArray(store.memories)?store.memories:[];store.notifications=Array.isArray(store.notifications)?store.notifications:[]}catch(e){if(e.code!=="ENOENT")throw e;await persist()}}}
function audit(event,detail){store.audit.unshift({id:crypto.randomUUID(),event,detail:String(detail||"").slice(0,240),at:new Date().toISOString()});store.audit=store.audit.slice(0,300)}
function notify(type,title,message){const item={id:crypto.randomUUID(),type:String(type).slice(0,32),title:String(title).slice(0,100),message:String(message||"").slice(0,240),createdAt:new Date().toISOString(),readAt:null};store.notifications.unshift(item);store.notifications=store.notifications.slice(0,150);return item}
function equal(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function cookies(req){return Object.fromEntries((req.headers.cookie||"").split(";").map(s=>s.trim()).filter(Boolean).map(s=>{const i=s.indexOf("=");return[decodeURIComponent(s.slice(0,i)),decodeURIComponent(s.slice(i+1))]}))}
function opts(httpOnly){return{httpOnly,secure:SECURE,sameSite:"Strict",path:"/",maxAge:httpOnly?SESSION_TTL:86400000}}
function csrf(res){const token=crypto.randomBytes(24).toString("hex");res.cookie("ultron_csrf",token,opts(false));return token}
function signature(id){return crypto.createHmac("sha256",process.env.ULTRON_SESSION_SECRET||process.env.ULTRON_SETUP_KEY||"development-only-change-me").update(id).digest("hex")}
async function newSession(res){const id=crypto.randomBytes(32).toString("hex"),expires=Date.now()+SESSION_TTL;if(pool){await pool.query("DELETE FROM ultron_sessions WHERE expires_at<=NOW()");await pool.query("INSERT INTO ultron_sessions (session_hash,expires_at) VALUES ($1,to_timestamp($2/1000.0))",[crypto.createHash("sha256").update(id).digest("hex"),expires])}else sessions.set(id,{expires});res.cookie("ultron_session",id+"."+signature(id),opts(true));csrf(res)}
async function session(req){const token=cookies(req).ultron_session||"",i=token.lastIndexOf(".");if(i<1)return null;const id=token.slice(0,i);if(!equal(token.slice(i+1),signature(id)))return null;if(pool){const result=await pool.query("SELECT 1 FROM ultron_sessions WHERE session_hash=$1 AND expires_at>NOW()",[crypto.createHash("sha256").update(id).digest("hex")]);return result.rowCount?{id}:null}const s=sessions.get(id);if(!s||s.expires<Date.now()){sessions.delete(id);return null}return{id}}
async function auth(req,res,next){try{const s=await session(req);if(!s)return res.status(401).json({error:"Authentication required"});req.sessionId=s.id;next()}catch(e){next(e)}}
function checkCsrf(req,res,next){const c=cookies(req).ultron_csrf;if(!c||!equal(c,req.get("x-csrf-token")))return res.status(403).json({error:"CSRF validation failed"});next()}
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,k)=>e?reject(e):resolve({salt,hash:k.toString("hex")})))}
async function verifyPassword(password,saved){const h=await hashPassword(password,saved.salt);return equal(h.hash,saved.hash)}

const googleOAuthLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:"draft-7",legacyHeaders:false});
function googleStateHash(value){return crypto.createHash("sha256").update(String(value)).digest("hex")}

async function googleAccessToken(service){
 const result=await pool.query("SELECT encrypted_tokens FROM ultron_google_connections WHERE service=$1",[service]);
 if(!result.rowCount)throw Object.assign(new Error("Google service is not connected"),{status:404});
 const token=await googleOAuth.readTokens(result.rows[0].encrypted_tokens);
 if(token.encrypted!==result.rows[0].encrypted_tokens)await pool.query("UPDATE ultron_google_connections SET encrypted_tokens=$2,updated_at=NOW() WHERE service=$1",[service,token.encrypted]);
 return token.accessToken;
}

async function fetchGoogleJson(url,accessToken){
 const response=await fetch(url,{headers:{Authorization:"Bearer "+accessToken},signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error("Google provider request failed ("+response.status+")");
 return data;
}
async function collectBriefingService(service){
 try{
  if(service==="gmail"){
   const accessToken=await googleAccessToken("gmail");
   const list=await fetchGoogleJson("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5",accessToken);
   const messages=await Promise.all((list.messages||[]).slice(0,5).map(async item=>{
    const message=await fetchGoogleJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",accessToken);
    const headers=message.payload&&message.payload.headers||[];
    const header=name=>(headers.find(x=>String(x.name).toLowerCase()===name.toLowerCase())||{}).value||"";
    return{id:message.id,subject:String(header("Subject")||"(No subject)").slice(0,140),from:String(header("From")).slice(0,140),date:String(header("Date")).slice(0,80),snippet:String(message.snippet||"").slice(0,180),unread:(message.labelIds||[]).includes("UNREAD")};
   }));
   return{connected:true,items:messages};
  }
  const accessToken=await googleAccessToken("calendar");
  const params=new URLSearchParams({maxResults:"8",orderBy:"startTime",singleEvents:"true",timeMin:new Date().toISOString()});
  const data=await fetchGoogleJson("https://www.googleapis.com/calendar/v3/calendars/primary/events?"+params.toString(),accessToken);
  return{connected:true,items:(data.items||[]).map(event=>({id:event.id,summary:String(event.summary||"Untitled event").slice(0,140),start:event.start&&(event.start.dateTime||event.start.date)||"",end:event.end&&(event.end.dateTime||event.end.date)||"",location:String(event.location||"").slice(0,140)}))};
 }catch(error){return{connected:false,items:[],error:error.status===404?"Not connected":error.name==="TimeoutError"?"Google request timed out":"Google service temporarily unavailable"}}
}
app.get("/api/briefing",auth,googleOAuthLimiter,async(_q,r)=>{
 const [gmail,calendar]=await Promise.all([collectBriefingService("gmail"),collectBriefingService("calendar")]);
 const pendingApprovals=store.approvals.filter(item=>item.status==="pending").length;
 const activeTasks=store.tasks.filter(item=>["queued","in_progress"].includes(item.status)).length;
 const unread=gmail.items.filter(item=>item.unread).length;
 const briefing={
  generatedAt:new Date().toISOString(),
  headline:"Your ULTRON daily briefing",
  summary:[calendar.items.length+" upcoming calendar events",gmail.connected?unread+" unread messages in the latest inbox sample":"Gmail not connected",pendingApprovals+" pending approvals",activeTasks+" active tasks"].join(" · "),
  gmail,calendar,pendingApprovals,activeTasks,
  notices:[...(!gmail.connected?[{type:"integration",text:"Connect Gmail to include inbox highlights."}]:[]),...(!calendar.connected?[{type:"integration",text:"Connect Calendar to include upcoming events."}]:[]),...(pendingApprovals?[{type:"approval",text:pendingApprovals+" action(s) are waiting for your review."}]:[])]
 };
 r.set("Cache-Control","no-store");r.json({briefing});
});

app.get("/api/integrations/google/gmail/messages",auth,googleOAuthLimiter,async(_q,r)=>{
 if(!pool)return r.status(503).json({error:"PostgreSQL is required"});
 try{
  const accessToken=await googleAccessToken("gmail");
  const headers={Authorization:"Bearer "+accessToken};
  const listResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",{headers});
  const list=await listResponse.json();
  if(!listResponse.ok)throw new Error("Gmail API request failed");
  const messages=await Promise.all((list.messages||[]).slice(0,10).map(async item=>{
   const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",{headers});
   if(!response.ok)return null;
   const message=await response.json(),headersList=message.payload&&message.payload.headers||[];
   const header=name=>(headersList.find(x=>String(x.name).toLowerCase()===name.toLowerCase())||{}).value||"";
   return{id:message.id,threadId:message.threadId,snippet:String(message.snippet||"").slice(0,240),subject:header("Subject").slice(0,180),from:header("From").slice(0,180),date:header("Date").slice(0,80),unread:(message.labelIds||[]).includes("UNREAD")};
  }));
  r.set("Cache-Control","no-store");r.json({messages:messages.filter(Boolean)});
 }catch(error){r.status(error.status||502).json({error:error.message||"Unable to read Gmail"})}
});
app.get("/api/integrations/google/calendar/events",auth,googleOAuthLimiter,async(_q,r)=>{
 if(!pool)return r.status(503).json({error:"PostgreSQL is required"});
 try{
  const accessToken=await googleAccessToken("calendar");
  const params=new URLSearchParams({maxResults:"15",orderBy:"startTime",singleEvents:"true",timeMin:new Date().toISOString()});
  const response=await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?"+params.toString(),{headers:{Authorization:"Bearer "+accessToken}});
  const data=await response.json();
  if(!response.ok)throw new Error("Google Calendar API request failed");
  const events=(data.items||[]).map(item=>({id:item.id,summary:String(item.summary||"Untitled event").slice(0,180),start:item.start&& (item.start.dateTime||item.start.date)||"",end:item.end&&(item.end.dateTime||item.end.date)||"",location:String(item.location||"").slice(0,180),status:item.status}));
  r.set("Cache-Control","no-store");r.json({events});
 }catch(error){r.status(error.status||502).json({error:error.message||"Unable to read Calendar"})}
});

app.get("/api/integrations/google/status",auth,async(_q,r)=>{
 const configured=!!googleOAuth.config();
 if(!pool)return r.json({configured,storageReady:false,connections:[],message:"Google OAuth requires PostgreSQL"});
 const result=await pool.query("SELECT service,email,scopes,connected_at FROM ultron_google_connections ORDER BY service");
 r.set("Cache-Control","no-store");
 r.json({configured,storageReady:true,connections:result.rows,message:configured?"Google OAuth is ready":"Add Google OAuth secrets to the hosting environment"});
});
app.get("/api/integrations/google/:service/connect",auth,googleOAuthLimiter,async(q,r)=>{
 const service=q.params.service;
 if(!["gmail","calendar"].includes(service))return r.status(404).send("Unknown Google service");
 if(!pool)return r.status(503).send("Google connection requires PostgreSQL.");
 if(!googleOAuth.config())return r.status(503).send("Google OAuth is not configured. See docs/GOOGLE_OAUTH.md.");
 const state=crypto.randomBytes(32).toString("hex");
 await pool.query("DELETE FROM ultron_google_oauth_states WHERE expires_at<=NOW()");
 await pool.query("INSERT INTO ultron_google_oauth_states (state_hash,service,expires_at) VALUES ($1,$2,NOW()+INTERVAL '10 minutes')",[googleStateHash(state),service]);
 r.cookie("ultron_google_oauth",state,{httpOnly:true,secure:SECURE,sameSite:"Lax",path:"/api/integrations/google/callback",maxAge:10*60*1000});
 r.redirect(302,googleOAuth.buildAuthUrl(service,state));
});
app.get("/api/integrations/google/callback",googleOAuthLimiter,async(q,r)=>{
 const state=String(q.query.state||""),cookie=cookies(q).ultron_google_oauth;
 r.clearCookie("ultron_google_oauth",{httpOnly:true,secure:SECURE,sameSite:"Lax",path:"/api/integrations/google/callback"});
 if(q.query.error)return r.redirect(302,"/?google=denied");
 if(!pool||!state||!cookie||!equal(state,cookie))return r.redirect(302,"/?google=invalid_state");
 const stateResult=await pool.query("DELETE FROM ultron_google_oauth_states WHERE state_hash=$1 AND expires_at>NOW() RETURNING service",[googleStateHash(state)]);
 if(!stateResult.rowCount)return r.redirect(302,"/?google=expired_state");
 const service=stateResult.rows[0].service;
 try{
  const token=await googleOAuth.exchangeCode(String(q.query.code||""));
  const tokenData=await googleOAuth.readTokens(token.encrypted);
  const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+tokenData.accessToken}});
  const profile=profileResponse.ok?await profileResponse.json():{};
  await pool.query("INSERT INTO ultron_google_connections (service,encrypted_tokens,email,scopes,connected_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (service) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,email=EXCLUDED.email,scopes=EXCLUDED.scopes,connected_at=NOW(),updated_at=NOW()",[service,token.encrypted,typeof profile.email==="string"?profile.email:null,token.scopes]);
  audit("integration.google.connected",service+" connected with read-only access");await persist();
  r.redirect(302,"/?google=connected");
 }catch(error){audit("integration.google.failed",service+" OAuth callback failed");await persist();r.redirect(302,"/?google=failed")}
});
app.post("/api/integrations/google/:service/disconnect",auth,checkCsrf,async(q,r)=>{
 const service=q.params.service;
 if(!["gmail","calendar"].includes(service))return r.status(404).json({error:"Unknown Google service"});
 if(!pool)return r.status(503).json({error:"PostgreSQL is required"});
 const result=await pool.query("SELECT encrypted_tokens FROM ultron_google_connections WHERE service=$1",[service]);
 if(!result.rowCount)return r.status(404).json({error:"Google service is not connected"});
 try{
  const cfg=googleOAuth.config();
  if(cfg){const tokens=googleOAuth.decrypt(result.rows[0].encrypted_tokens,cfg.key);const revoke=tokens.refresh_token||tokens.access_token;if(revoke)await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:revoke})})}
 }catch{}
 await pool.query("DELETE FROM ultron_google_connections WHERE service=$1",[service]);
 audit("integration.google.disconnected",service+" disconnected and local tokens deleted");await persist();
 r.json({ok:true});
});

app.get("/api/health",async(_q,r)=>{let database="file";if(pool){try{await pool.query("SELECT 1");database="postgres"}catch{database="unavailable"}}r.status(database==="unavailable"?503:200).json({ok:database!=="unavailable",name:"ULTRON",status:database==="unavailable"?"degraded":"operational",database,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),timestamp:new Date().toISOString(),integrations:{gmail:"not_connected",calendar:"not_connected",youtube:"not_connected",whatsapp:"not_connected",trading:"simulation_only"}})});
app.get("/api/auth/bootstrap",(_q,r)=>r.json({configured:!!store.admin,csrfToken:csrf(r)}));
app.post("/api/auth/setup",authLimiter,checkCsrf,async(q,r)=>{if(store.admin)return r.status(409).json({error:"Administrator already configured"});const{setupKey,username,password}=q.body||{};if(!process.env.ULTRON_SETUP_KEY)return r.status(503).json({error:"Initial setup is disabled. Configure ULTRON_SETUP_KEY on the server."});if(!equal(setupKey,process.env.ULTRON_SETUP_KEY))return r.status(403).json({error:"Invalid setup key"});if(typeof username!=="string"||!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))return r.status(400).json({error:"Username must be 3–32 valid characters"});if(typeof password!=="string"||password.length<12||password.length>128)return r.status(400).json({error:"Password must be 12–128 characters"});store.admin={username,password:await hashPassword(password),createdAt:new Date().toISOString()};audit("admin.created","Initial administrator created");await persist();await newSession(r);r.status(201).json({ok:true,user:{username}})});
app.post("/api/auth/login",authLimiter,checkCsrf,async(q,r)=>{const{username,password}=q.body||{};if(!store.admin||typeof username!=="string"||typeof password!=="string"||username!==store.admin.username||!(await verifyPassword(password,store.admin.password))){audit("auth.failed","Rejected administrator sign-in");await persist();return r.status(401).json({error:"Invalid username or password"})}await newSession(r);audit("auth.login","Administrator signed in");await persist();r.json({ok:true,user:{username:store.admin.username}})});
app.get("/api/auth/me",async(q,r)=>{const s=await session(q);r.set("Cache-Control","no-store");r.json({authenticated:!!s,user:s&&store.admin?{username:store.admin.username}:null,configured:!!store.admin})});
app.post("/api/auth/logout",auth,checkCsrf,async(q,r)=>{sessions.delete(q.sessionId);if(pool)await pool.query("DELETE FROM ultron_sessions WHERE session_hash=$1",[crypto.createHash("sha256").update(q.sessionId).digest("hex")]);r.clearCookie("ultron_session",{path:"/",sameSite:"Strict",secure:SECURE});r.clearCookie("ultron_csrf",{path:"/",sameSite:"Strict",secure:SECURE});r.json({ok:true})});
app.get("/api/overview",auth,(_q,r)=>r.json({assistant:"ULTRON",mode:"SECURE FOUNDATION",security:"approval_required",agents:[{id:"personal",name:"Personal Assistant",state:"standby"},{id:"research",name:"Research Agent",state:"standby"},{id:"memory",name:"Memory Engine",state:"planned"},{id:"communications",name:"Communications",state:"planned"},{id:"market",name:"Market Intelligence",state:"simulation"}],activity:store.audit.slice(0,8).map(x=>({time:x.at,label:x.detail,kind:x.event}))}));
app.get("/api/agents",auth,async(_q,r)=>{
 const connected=new Set();
 if(pool){try{const result=await pool.query("SELECT service FROM ultron_google_connections");for(const row of result.rows)connected.add(row.service)}catch{return r.status(503).json({error:"Unable to inspect integration registry"})}}
 const agents=[
  {id:"personal",name:"Personal AI",category:"Core",mode:"chat_only",status:process.env.OPENAI_API_KEY?"available":"provider_required",canRun:!!process.env.OPENAI_API_KEY,capabilities:["Natural-language conversation","Session-only context"],permissions:["No external tools","No autonomous actions"],guardrail:"Chat responses only; no account or device actions"},
  {id:"memory",name:"Memory Vault",category:"Core",mode:"operator_controlled",status:"available",canRun:true,capabilities:["Save operator memories","List and delete saved records"],permissions:["Authenticated operator only"],guardrail:"No automatic collection; operator controls saved records"},
  {id:"gmail",name:"Gmail Intelligence",category:"Communications",mode:"read_only",status:connected.has("gmail")?"connected":"connect_required",canRun:connected.has("gmail"),capabilities:["Read recent message metadata","Show snippets and unread status"],permissions:["Gmail read-only OAuth"],guardrail:"Cannot send, delete, label, or modify email"},
  {id:"calendar",name:"Calendar Planner",category:"Productivity",mode:"read_only",status:connected.has("calendar")?"connected":"connect_required",canRun:connected.has("calendar"),capabilities:["Read upcoming events","Display event time and location"],permissions:["Calendar read-only OAuth"],guardrail:"Cannot create, edit, or delete events"},
  {id:"research",name:"Research Agent",category:"Intelligence",mode:"planned",status:"planned",canRun:false,capabilities:["Research workflow blueprint"],permissions:["No external provider connected"],guardrail:"Research execution is not enabled"},
  {id:"youtube",name:"YouTube Intelligence",category:"Creator",mode:"planned",status:"planned",canRun:false,capabilities:["Channel analytics roadmap","Content planning roadmap"],permissions:["No ULTRON YouTube OAuth connection"],guardrail:"ChatGPT vidIQ/Metricool access is separate from ULTRON"},
  {id:"whatsapp",name:"WhatsApp Assistant",category:"Communications",mode:"planned",status:"official_api_required",canRun:false,capabilities:["Official WhatsApp Business integration planned"],permissions:["Meta Business Cloud API required"],guardrail:"No unofficial WhatsApp automation"},
  {id:"market",name:"Market Intelligence",category:"Finance",mode:"simulation_only",status:"simulation_only",canRun:false,capabilities:["Paper-trading architecture planned"],permissions:["No broker credentials"],guardrail:"Real trades and money movement are disabled"},
  {id:"meeting",name:"Meeting Assistant",category:"Productivity",mode:"planned",status:"planned",canRun:false,capabilities:["Meeting notes workflow planned"],permissions:["No recording or calendar write access"],guardrail:"No recording or attendance tracking is active"},
  {id:"phone",name:"Device Assistant",category:"Device",mode:"planned",status:"planned",canRun:false,capabilities:["Device automation roadmap"],permissions:["No device bridge installed"],guardrail:"Cannot control phone, calls, alarms, or apps"}
 ];
 r.set("Cache-Control","no-store");r.json({agents,summary:{total:agents.length,available:agents.filter(a=>a.canRun).length,connected:agents.filter(a=>a.status==="connected").length,planned:agents.filter(a=>["planned","official_api_required","simulation_only"].includes(a.status)).length}});
});
app.get("/api/notifications",auth,(_q,r)=>{const items=store.notifications.slice(0,100);r.set("Cache-Control","no-store");r.json({notifications:items,unread:items.filter(x=>!x.readAt).length})});
app.patch("/api/notifications/:id",auth,checkCsrf,async(q,r)=>{const item=store.notifications.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Notification not found"});item.readAt=item.readAt||new Date().toISOString();await persist();r.json({notification:item})});
app.delete("/api/notifications/:id",auth,checkCsrf,async(q,r)=>{const before=store.notifications.length;store.notifications=store.notifications.filter(x=>x.id!==q.params.id);if(before===store.notifications.length)return r.status(404).json({error:"Notification not found"});await persist();r.json({ok:true})});
app.post("/api/notifications/read-all",auth,checkCsrf,async(_q,r)=>{const at=new Date().toISOString();for(const item of store.notifications)if(!item.readAt)item.readAt=at;await persist();r.json({ok:true})});

app.get("/api/approvals",auth,(_q,r)=>r.json({approvals:store.approvals}));
app.post("/api/approvals",auth,checkCsrf,async(q,r)=>{const{title,details,actionType,risk}=q.body||{};if(typeof title!=="string"||title.trim().length<3||title.length>100)return r.status(400).json({error:"Title must be 3–100 characters"});if(typeof details!=="string"||details.length>1000)return r.status(400).json({error:"Details must be 1000 characters or fewer"});if(!["send_message","publish_content","delete_data","financial_action","other"].includes(actionType)||!["low","medium","high","critical"].includes(risk))return r.status(400).json({error:"Invalid action type or risk"});const item={id:crypto.randomUUID(),title:title.trim(),details:details.trim(),actionType,risk,status:"pending",createdAt:new Date().toISOString(),reviewedAt:null};store.approvals.unshift(item);store.approvals=store.approvals.slice(0,200);audit("approval.created","Approval requested: "+item.title);notify("approval","Approval awaiting review",item.title);await persist();r.status(201).json({approval:item})});
app.patch("/api/approvals/:id",auth,checkCsrf,async(q,r)=>{const{decision}=q.body||{};if(!["approved","rejected"].includes(decision))return r.status(400).json({error:"Decision must be approved or rejected"});const item=store.approvals.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Request not found"});if(item.status!=="pending")return r.status(409).json({error:"Request already reviewed"});item.status=decision;item.reviewedAt=new Date().toISOString();audit("approval."+decision,item.title+" was "+decision);notify("approval","Approval "+decision,item.title);await persist();r.json({approval:item})});

app.get("/api/tasks",auth,(_q,r)=>r.json({tasks:store.tasks.slice(0,100)}));
app.post("/api/tasks",auth,checkCsrf,async(q,r)=>{const{title,details,priority}=q.body||{};if(typeof title!=="string"||title.trim().length<3||title.length>120)return r.status(400).json({error:"Task title must be 3–120 characters"});if(typeof details!=="string"||details.length>1500)return r.status(400).json({error:"Task details must be 1500 characters or fewer"});if(!["low","normal","high"].includes(priority))return r.status(400).json({error:"Invalid task priority"});const task={id:crypto.randomUUID(),title:title.trim(),details:details.trim(),priority,status:"queued",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};store.tasks.unshift(task);store.tasks=store.tasks.slice(0,200);audit("task.created","Task queued: "+task.title);notify("task","Task added to queue",task.title);await persist();r.status(201).json({task})});
app.patch("/api/tasks/:id",auth,checkCsrf,async(q,r)=>{const task=store.tasks.find(x=>x.id===q.params.id);if(!task)return r.status(404).json({error:"Task not found"});const{status}=q.body||{};if(!["queued","in_progress","completed","cancelled"].includes(status))return r.status(400).json({error:"Invalid task status"});if(task.status==="completed"||task.status==="cancelled")return r.status(409).json({error:"Finalized tasks cannot be changed"});task.status=status;task.updatedAt=new Date().toISOString();audit("task."+status,"Task "+status+": "+task.title);await persist();r.json({task})});
app.get("/api/jobs",auth,async(_q,r)=>{
 if(!pool)return r.status(503).json({error:"Background jobs require PostgreSQL. Configure DATABASE_URL."});
 const limit=Math.min(Math.max(Number(_q.query.limit)||30,1),100);
 const result=await pool.query("SELECT id,job_type,status,payload,result,attempts,max_attempts,last_error,created_at,updated_at FROM ultron_jobs ORDER BY created_at DESC LIMIT $1",[limit]);
 const counts=await pool.query("SELECT status,COUNT(*)::int AS count FROM ultron_jobs GROUP BY status");
 r.set("Cache-Control","no-store");r.json({jobs:result.rows,counts:counts.rows});
});
app.post("/api/jobs",auth,checkCsrf,async(q,r)=>{
 if(!pool)return r.status(503).json({error:"Background jobs require PostgreSQL. Configure DATABASE_URL."});
 const{type}=q.body||{};
 const allowed=["maintenance.session_cleanup","maintenance.database_health"];
 if(!allowed.includes(type))return r.status(400).json({error:"Unsupported job type"});
 const id=crypto.randomUUID();
 const result=await pool.query("INSERT INTO ultron_jobs (id,job_type,payload,status,max_attempts) VALUES ($1,$2,'{}'::jsonb,'queued',4) RETURNING id,job_type,status,attempts,max_attempts,created_at",[id,type]);
 audit("job.queued","Maintenance job queued: "+type);notify("job","Maintenance job queued",type);await persist();
 r.status(201).json({job:result.rows[0]});
});
app.get("/api/memory",auth,(_q,r)=>r.json({memories:store.memories.slice(0,100)}));
app.post("/api/memory",auth,checkCsrf,async(q,r)=>{const{content,category}=q.body||{};if(typeof content!=="string"||content.trim().length<2||content.length>2000)return r.status(400).json({error:"Memory must be 2–2000 characters"});if(!["preference","project","fact","reminder"].includes(category))return r.status(400).json({error:"Invalid memory category"});const item={id:crypto.randomUUID(),content:content.trim(),category,createdAt:new Date().toISOString()};store.memories.unshift(item);store.memories=store.memories.slice(0,200);audit("memory.created","Memory saved ("+category+")");notify("memory","Memory saved",category+" memory added to your vault");await persist();r.status(201).json({memory:item})});
app.delete("/api/memory/:id",auth,checkCsrf,async(q,r)=>{const before=store.memories.length;store.memories=store.memories.filter(x=>x.id!==q.params.id);if(before===store.memories.length)return r.status(404).json({error:"Memory not found"});audit("memory.deleted","A memory record was deleted");notify("memory","Memory deleted","A memory record was removed");await persist();r.json({ok:true})});
app.get("/api/audit",auth,(q,r)=>r.json({events:store.audit.slice(0,Math.min(Math.max(Number(q.query.limit)||50,1),100))}));
app.get("/api/system/diagnostics",auth,async(_q,r)=>{
 let database={status:"local_json",durable:false};
 if(pool){try{await pool.query("SELECT 1");database={status:"connected",durable:true}}catch{database={status:"unavailable",durable:false}}}
 const checks=[
  {id:"database",label:"Primary storage",status:database.status,detail:database.durable?"PostgreSQL connection verified":"Local JSON fallback is not durable on ephemeral hosting"},
  {id:"sessions",label:"Login sessions",status:pool?"postgres_persistent":"memory_only",detail:pool?"Session hashes and expiry are stored in PostgreSQL":"Sessions are process-local in development mode"},
  {id:"ai",label:"AI provider",status:process.env.OPENAI_API_KEY?"configured":"not_configured",detail:process.env.OPENAI_API_KEY?"Server-side provider key is present":"Add OPENAI_API_KEY in the hosting environment"},
  {id:"gmail",label:"Gmail",status:googleOAuth.config()?"oauth_ready":"not_configured",detail:"Read-only Gmail OAuth; email sending is not enabled"},
  {id:"calendar",label:"Google Calendar",status:googleOAuth.config()?"oauth_ready":"not_configured",detail:"Read-only Calendar OAuth; event changes are not enabled"},
  {id:"worker",label:"Background job worker",status:pool?"active":"postgres_required",detail:pool?"PostgreSQL-backed worker processes allowlisted internal maintenance jobs":"Configure PostgreSQL to enable durable background jobs"},
  {id:"execution",label:"External action execution",status:"disabled",detail:"Approval records do not execute external actions"}
 ];
 r.set("Cache-Control","no-store");r.json({name:"ULTRON",checkedAt:new Date().toISOString(),checks,secureMode:true});
});
app.get("/api/export",auth,async(_q,r)=>{
 const backup={format:"ultron-backup",schemaVersion:1,exportedAt:new Date().toISOString(),data:{approvals:store.approvals,audit:store.audit,tasks:store.tasks,memories:store.memories,notifications:store.notifications}};
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 r.set("Cache-Control","no-store");r.set("Content-Type","application/json; charset=utf-8");r.set("Content-Disposition",'attachment; filename="ultron-backup-'+stamp+'.json"');r.send(JSON.stringify(backup,null,2));
});

app.get("/api/assistant/status",auth,(_q,r)=>r.json({configured:!!process.env.OPENAI_API_KEY,provider:"openai",model:process.env.OPENAI_MODEL||"gpt-6.2-astra",toolsEnabled:false,conversationStorage:"client-session-only"}));
app.post("/api/assistant/chat",auth,checkCsrf,chatLimiter,async(q,r)=>{
 const messages=q.body&&q.body.messages;
 if(!Array.isArray(messages)||messages.length<1||messages.length>12)return r.status(400).json({error:"Send between 1 and 12 recent messages"});
 const valid=messages.every(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string"&&m.content.trim().length>0&&m.content.length<=4000);
 if(!valid||messages[messages.length-1].role!=="user")return r.status(400).json({error:"Invalid message history"});
 try{const result=await generateAssistantReply(messages);r.json({reply:result.text,model:result.model})}
 catch(e){r.status(e.status||502).json({error:e.message||"Assistant provider unavailable"})}
});
app.get("/api/status",(_q,r)=>r.json({status:"online",environment:process.env.NODE_ENV||"development",node:process.version}));
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"],maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.use((q,r)=>q.path.startsWith("/api/")?r.status(404).json({error:"API route not found"}):r.status(404).sendFile(path.join(__dirname,"public","index.html")));
app.use((e,_q,r,_n)=>{console.error("Request error:",e.message);r.status(500).json({error:"Internal server error"})});
load().then(()=>{if(process.env.NODE_ENV==="production"&&(!process.env.ULTRON_SESSION_SECRET||process.env.ULTRON_SESSION_SECRET.length<32))throw Error("Production requires ULTRON_SESSION_SECRET with at least 32 characters");
const worker=pool?createJobWorker({pool,concurrency:2,pollMs:2000}):null;if(worker)worker.start();
const server=app.listen(PORT,HOST,()=>console.log("ULTRON v1.2 running on "+HOST+":"+PORT+" | storage: "+(pool?"PostgreSQL":"local JSON")+" | worker: "+(worker?"active":"disabled")));
const shutdown=()=>{server.close(async()=>{if(worker)await worker.stop();if(pool)await pool.end();process.exit(0)})};process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown)}).catch(e=>{console.error("ULTRON startup failed:",e);process.exit(1)});
