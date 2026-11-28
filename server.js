require("dotenv").config();
const express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),path=require("path"),fs=require("fs"),crypto=require("crypto");
const {generateAssistantReply}=require("./lib/ai-provider");
const {synthesizeSpeech}=require("./lib/elevenlabs-provider");
const httpSafety=require("./lib/http-safety");
const {Pool}=require("pg");
const {runMigrations,syncProjection}=require("./lib/db-migrations");
const {createJobWorker}=require("./lib/job-worker");
const googleOAuth=require("./lib/google-oauth");
const {buildIntelligenceSnapshot}=require("./lib/intelligence");
const {buildConfigurationReport}=require("./lib/configuration");
const approvalPolicy=require("./lib/approval-policy");
const agentOrchestrator=require("./lib/agent-orchestrator");
const memorySearch=require("./lib/memory-search");
const memoryRecords=require("./lib/memory-records");
const assistantContext=require("./lib/assistant-context");
const workspaceIntel=require("./lib/google-workspace-intelligence");
const workflowEngine=require("./lib/workflow-engine");
const taskIntel=require("./lib/task-intelligence");
const notificationIntel=require("./lib/notification-intelligence");
const focusEngine=require("./lib/focus-sessions");
const {createShutdownHandler}=require("./lib/lifecycle");
const telemetry=require("./lib/telemetry");
const {validateProductionEnvironment}=require("./lib/production-config");
const bootstrapAdmin=require("./lib/admin-bootstrap");
const app=express(),PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||"0.0.0.0";
const DATA_DIR=process.env.ULTRON_DATA_DIR?path.resolve(process.env.ULTRON_DATA_DIR):path.join(__dirname,"data"),STORE_FILE=path.join(DATA_DIR,"store.json"),SESSION_TTL=30*24*60*60*1000,SECURE=process.env.NODE_ENV==="production";
const sessions=new Map(),processStartedAt=process.hrtime.bigint();let store={version:2,admin:null,approvals:[],audit:[],tasks:[],memories:[],notifications:[],focusSessions:[],reminders:[],workflows:[]},writeQueue=Promise.resolve();
const pgSslMode=String(process.env.PGSSLMODE||"require").toLowerCase();
if(!["verify-full","require","disable"].includes(pgSslMode))throw new Error("PGSSLMODE must be verify-full, require, or disable");
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:pgSslMode==="disable"?false:{rejectUnauthorized:pgSslMode==="verify-full"},max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
app.disable("x-powered-by");app.set("trust proxy",process.env.TRUST_PROXY==="true"?1:false);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:null}}}));
app.use(express.json({limit:"24kb"}));app.use("/api",(req,res,next)=>{res.set("Cache-Control","no-store");next()});app.use("/api",rateLimit({windowMs:15*60*1000,limit:600,standardHeaders:"draft-7",legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:"API rate limit reached. Please wait briefly and retry.",code:"API_RATE_LIMITED"})}));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"Too many authentication attempts. Try again later."}});
const chatLimiter=rateLimit({windowMs:15*60*1000,limit:25,standardHeaders:"draft-7",legacyHeaders:false});
async function persist(){const snapshot=JSON.stringify(store),data=JSON.parse(snapshot);writeQueue=writeQueue.catch(()=>{}).then(async()=>{if(pool){const client=await pool.connect();try{await client.query("BEGIN");await client.query("INSERT INTO ultron_state (id,payload,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",[snapshot]);await syncProjection(client,data);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}return}await fs.promises.mkdir(DATA_DIR,{recursive:true});const tmp=STORE_FILE+".tmp";await fs.promises.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await fs.promises.rename(tmp,STORE_FILE)});return writeQueue}
async function load(){if(pool){await runMigrations(pool);const result=await pool.query("SELECT payload FROM ultron_state WHERE id=1");if(result.rowCount){store={...store,...result.rows[0].payload};store.notifications=Array.isArray(store.notifications)?store.notifications:[];store.focusSessions=Array.isArray(store.focusSessions)?store.focusSessions:[];store.reminders=Array.isArray(store.reminders)?store.reminders:[];store.workflows=Array.isArray(store.workflows)?store.workflows:[];await persist()}else await persist()}else{await fs.promises.mkdir(DATA_DIR,{recursive:true});try{const x=JSON.parse(await fs.promises.readFile(STORE_FILE,"utf8"));store={...store,...x};if(!Array.isArray(store.approvals)||!Array.isArray(store.audit))throw Error("Invalid data store");store.tasks=Array.isArray(store.tasks)?store.tasks:[];store.memories=Array.isArray(store.memories)?store.memories:[];store.notifications=Array.isArray(store.notifications)?store.notifications:[];store.focusSessions=Array.isArray(store.focusSessions)?store.focusSessions:[];store.reminders=Array.isArray(store.reminders)?store.reminders:[];store.workflows=Array.isArray(store.workflows)?store.workflows:[]}catch(e){if(e.code!=="ENOENT")throw e;await persist()}}}
function audit(event,detail){store.audit.unshift({id:crypto.randomUUID(),event,detail:String(detail||"").slice(0,240),at:new Date().toISOString()});store.audit=store.audit.slice(0,300)}
function notify(type,title,message){const item={id:crypto.randomUUID(),type:String(type).slice(0,32),title:String(title).slice(0,100),message:String(message||"").slice(0,240),createdAt:new Date().toISOString(),readAt:null};store.notifications.unshift(item);store.notifications=store.notifications.slice(0,150);return item}
function equal(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function cookies(req){return httpSafety.parseCookies(req.headers.cookie||"")}
function opts(httpOnly){return{httpOnly,secure:SECURE,sameSite:"Strict",path:"/",maxAge:httpOnly?SESSION_TTL:86400000}}
function csrf(res){const token=crypto.randomBytes(24).toString("hex");res.cookie("ultron_csrf",token,opts(false));return token}
function signature(id){return crypto.createHmac("sha256",process.env.ULTRON_SESSION_SECRET||process.env.ULTRON_SETUP_KEY||"development-only-change-me").update(id).digest("hex")}
async function newSession(res){const id=crypto.randomBytes(32).toString("hex"),expires=Date.now()+SESSION_TTL;if(pool){await pool.query("DELETE FROM ultron_sessions WHERE expires_at<=NOW()");await pool.query("INSERT INTO ultron_sessions (session_hash,expires_at) VALUES ($1,to_timestamp($2/1000.0))",[crypto.createHash("sha256").update(id).digest("hex"),expires])}else{for(const [sessionId,record] of sessions){if(record.expires<=Date.now())sessions.delete(sessionId)}if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);sessions.set(id,{expires})}res.cookie("ultron_session",id+"."+signature(id),opts(true));csrf(res)}
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

app.get("/api/intelligence/workspace",auth,googleOAuthLimiter,async(_q,r)=>{
 const [gmail,calendar]=await Promise.all([collectBriefingService("gmail"),collectBriefingService("calendar")]);
 const snapshot=buildIntelligenceSnapshot({gmail,calendar,tasks:store.tasks,approvals:store.approvals,now:new Date()});
 r.set("Cache-Control","no-store");r.json({intelligence:snapshot});
});

app.get("/api/workspace/command-plan",auth,googleOAuthLimiter,async(q,r)=>{
 const duration=Number(q.query.duration||60);
 if(!Number.isInteger(duration)||duration<15||duration>240)return r.status(400).json({error:"Duration must be between 15 and 240 minutes"});
 const [gmail,calendar]=await Promise.all([collectBriefingService("gmail"),collectBriefingService("calendar")]);
 const inbox=workspaceIntel.classifyInbox(gmail.items);
 const slots=workspaceIntel.findFocusSlots(calendar.items,{now:new Date(),durationMinutes:duration,days:5,maxSlots:8});
 const meetings=workspaceIntel.meetingPrep({events:calendar.items,emails:gmail.items,memories:store.memories,tasks:store.tasks,now:new Date(),limit:6});
 const drafts=inbox.items.filter(item=>item.needsAttention).slice(0,3).map(item=>({email:{id:item.id,subject:item.subject,from:item.from,category:item.category,priority:item.priorityLabel},draft:workspaceIntel.prepareReplyDraft(item)}));
 const plan={generatedAt:new Date().toISOString(),timezone:workspaceIntel.TZ,integrations:{gmail:gmail.connected,calendar:calendar.connected},inbox,focusSlots:slots,meetings,draftSuggestions:drafts,limits:{emailBodiesRead:false,linksOpened:false,attachmentsOpened:false,emailSending:false,calendarWrites:false},notes:[...(!gmail.connected?["Connect Gmail to enable inbox analysis."]:[]),...(!calendar.connected?["Connect Calendar to generate focus slots and meeting packets."]:[])]};
 r.set("Cache-Control","no-store");r.json({plan});
});

app.get("/api/integrations/google/gmail/messages",auth,googleOAuthLimiter,async(_q,r)=>{
 if(!pool)return r.status(503).json({error:"PostgreSQL is required"});
 try{
  const accessToken=await googleAccessToken("gmail");
  const headers={Authorization:"Bearer "+accessToken};
  const listResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",{headers,signal:AbortSignal.timeout(10000)});
  const list=await listResponse.json();
  if(!listResponse.ok)throw new Error("Gmail API request failed");
  const messages=await Promise.all((list.messages||[]).slice(0,10).map(async item=>{
   const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",{headers,signal:AbortSignal.timeout(10000)});
   if(!response.ok)return null;
   const message=await response.json(),headersList=message.payload&&message.payload.headers||[];
   const header=name=>(headersList.find(x=>String(x.name).toLowerCase()===name.toLowerCase())||{}).value||"";
   return{id:message.id,threadId:message.threadId,snippet:String(message.snippet||"").slice(0,240),subject:header("Subject").slice(0,180),from:header("From").slice(0,180),date:header("Date").slice(0,80),unread:(message.labelIds||[]).includes("UNREAD")};
  }));
  r.set("Cache-Control","no-store");r.json({messages:messages.filter(Boolean)});
 }catch(error){r.status(error.name==="TimeoutError"?504:502).json({error:error.name==="TimeoutError"?"Gmail request timed out":"Unable to read Gmail"})}
});
app.get("/api/integrations/google/calendar/events",auth,googleOAuthLimiter,async(_q,r)=>{
 if(!pool)return r.status(503).json({error:"PostgreSQL is required"});
 try{
  const accessToken=await googleAccessToken("calendar");
  const params=new URLSearchParams({maxResults:"15",orderBy:"startTime",singleEvents:"true",timeMin:new Date().toISOString()});
  const response=await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?"+params.toString(),{headers:{Authorization:"Bearer "+accessToken},signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok)throw new Error("Google Calendar API request failed");
  const events=(data.items||[]).map(item=>({id:item.id,summary:String(item.summary||"Untitled event").slice(0,180),start:item.start&& (item.start.dateTime||item.start.date)||"",end:item.end&&(item.end.dateTime||item.end.date)||"",location:String(item.location||"").slice(0,180),status:item.status}));
  r.set("Cache-Control","no-store");r.json({events});
 }catch(error){r.status(error.name==="TimeoutError"?504:502).json({error:error.name==="TimeoutError"?"Calendar request timed out":"Unable to read Calendar"})}
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
 const state=typeof q.query.state==="string"?q.query.state:"";
 const code=typeof q.query.code==="string"?q.query.code:"";
 const cookie=cookies(q).ultron_google_oauth;
 r.clearCookie("ultron_google_oauth",{httpOnly:true,secure:SECURE,sameSite:"Lax",path:"/api/integrations/google/callback"});
 if(q.query.error)return r.redirect(302,"/?google=denied");
 if(!pool||!state||!cookie||!equal(state,cookie))return r.redirect(302,"/?google=invalid_state");
 const stateResult=await pool.query("DELETE FROM ultron_google_oauth_states WHERE state_hash=$1 AND expires_at>NOW() RETURNING service",[googleStateHash(state)]);
 if(!stateResult.rowCount)return r.redirect(302,"/?google=expired_state");
 const service=stateResult.rows[0].service;
 try{
  if(!code||code.length>4096)throw new Error("Invalid Google authorization code");
  const token=await googleOAuth.exchangeCode(code,service);
  const tokenData=await googleOAuth.readTokens(token.encrypted);
  const profile=await googleOAuth.fetchUserInfo(tokenData.accessToken);
  if(!profile.sub||!profile.email||profile.email_verified!==true)throw new Error("Google account identity could not be verified");
  await pool.query("INSERT INTO ultron_google_connections (service,encrypted_tokens,email,scopes,connected_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (service) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,email=EXCLUDED.email,scopes=EXCLUDED.scopes,connected_at=NOW(),updated_at=NOW()",[service,token.encrypted,profile.email,token.scopes]);
  audit("integration.google.connected",service+" connected with verified Google identity and read-only access");await persist();
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
  if(cfg){const tokens=googleOAuth.decrypt(result.rows[0].encrypted_tokens,cfg.key);const revoke=tokens.refresh_token||tokens.access_token;if(revoke)await googleOAuth.revokeToken(revoke)}
 }catch{}
 await pool.query("DELETE FROM ultron_google_connections WHERE service=$1",[service]);
 audit("integration.google.disconnected",service+" disconnected and local tokens deleted");await persist();
 r.json({ok:true});
});

app.get("/api/health",async(_q,r)=>{let database="file";if(pool){try{await pool.query("SELECT 1");database="postgres"}catch{database="unavailable"}}const cpuTemperature=await telemetry.readCpuTemperature();const uptimeSeconds=Number(process.hrtime.bigint()-processStartedAt)/1e9;r.set("Cache-Control","no-store");r.status(database==="unavailable"?503:200).json({ok:database!=="unavailable",name:"ULTRON",status:database==="unavailable"?"degraded":"operational",database,uptimeSeconds,cpuTemperature,timestamp:new Date().toISOString(),integrations:{gmail:"not_connected",calendar:"not_connected",youtube:"not_connected",whatsapp:"not_connected",trading:"simulation_only"}})});
app.get("/api/auth/bootstrap",(_q,r)=>r.json({configured:!!store.admin,csrfToken:csrf(r)}));
app.post("/api/auth/setup",authLimiter,checkCsrf,async(q,r)=>{if(store.admin)return r.status(409).json({error:"Administrator already configured"});const{setupKey,username,password}=q.body||{};if(!process.env.ULTRON_SETUP_KEY)return r.status(503).json({error:"Initial setup is disabled. Configure ULTRON_SETUP_KEY on the server."});if(!equal(setupKey,process.env.ULTRON_SETUP_KEY))return r.status(403).json({error:"Invalid setup key"});if(typeof username!=="string"||!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))return r.status(400).json({error:"Username must be 3–32 valid characters"});if(typeof password!=="string"||password.length<12||password.length>128)return r.status(400).json({error:"Password must be 12–128 characters"});store.admin={username,password:await hashPassword(password),createdAt:new Date().toISOString()};audit("admin.created","Initial administrator created");await persist();await newSession(r);r.status(201).json({ok:true,user:{username}})});
app.post("/api/auth/login",authLimiter,checkCsrf,async(q,r)=>{const{username,password}=q.body||{};if(!store.admin||typeof username!=="string"||typeof password!=="string"||username!==store.admin.username||!(await verifyPassword(password,store.admin.password))){audit("auth.failed","Rejected administrator sign-in");await persist();return r.status(401).json({error:"Invalid username or password"})}await newSession(r);audit("auth.login","Administrator signed in");await persist();r.json({ok:true,user:{username:store.admin.username}})});
app.get("/api/auth/me",async(q,r)=>{const s=await session(q);r.set("Cache-Control","no-store");r.json({authenticated:!!s,user:s&&store.admin?{username:store.admin.username}:null,configured:!!store.admin})});
app.post("/api/auth/logout",auth,checkCsrf,async(q,r)=>{sessions.delete(q.sessionId);if(pool)await pool.query("DELETE FROM ultron_sessions WHERE session_hash=$1",[crypto.createHash("sha256").update(q.sessionId).digest("hex")]);r.clearCookie("ultron_session",{path:"/",sameSite:"Strict",secure:SECURE});r.clearCookie("ultron_csrf",{path:"/",sameSite:"Strict",secure:SECURE});r.json({ok:true})});
app.get("/api/overview",auth,(_q,r)=>r.json({assistant:"ULTRON",mode:"SECURE FOUNDATION",security:"approval_required",agents:[{id:"personal",name:"Personal Assistant",state:"standby"},{id:"research",name:"Research Agent",state:"standby"},{id:"memory",name:"Memory Engine",state:"planned"},{id:"communications",name:"Communications",state:"planned"},{id:"market",name:"Market Intelligence",state:"simulation"}],activity:store.audit.slice(0,8).map(x=>({time:x.at,label:x.detail,kind:x.event}))}));
app.get("/api/agents",auth,async(_q,r)=>{
 const connectedServices=[];
 if(pool){try{const result=await pool.query("SELECT service FROM ultron_google_connections");for(const row of result.rows)connectedServices.push(row.service)}catch{return r.status(503).json({error:"Unable to inspect integration registry"})}}
 const registry=agentOrchestrator.buildAgentRegistry({connectedServices,openAiConfigured:!!process.env.OPENAI_API_KEY});
 r.set("Cache-Control","no-store");r.json(registry);
});
app.get("/api/agents/:id",auth,async(q,r)=>{
 const connectedServices=[];
 if(pool){try{const result=await pool.query("SELECT service FROM ultron_google_connections");for(const row of result.rows)connectedServices.push(row.service)}catch{return r.status(503).json({error:"Unable to inspect integration registry"})}}
 const agent=agentOrchestrator.getAgent(q.params.id,{connectedServices,openAiConfigured:!!process.env.OPENAI_API_KEY});
 if(!agent)return r.status(404).json({error:"Agent not found"});
 r.set("Cache-Control","no-store");r.json({agent,executionEnabled:false});
});
app.get("/api/notifications",auth,(_q,r)=>{const data=notificationIntel.summarizeNotifications(store.notifications);r.set("Cache-Control","no-store");r.json({...data,unread:data.summary.unread})});
app.patch("/api/notifications/:id",auth,checkCsrf,async(q,r)=>{const item=store.notifications.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Notification not found"});item.readAt=item.readAt||new Date().toISOString();await persist();r.json({notification:item})});
app.delete("/api/notifications/:id",auth,checkCsrf,async(q,r)=>{const before=store.notifications.length;store.notifications=store.notifications.filter(x=>x.id!==q.params.id);if(before===store.notifications.length)return r.status(404).json({error:"Notification not found"});await persist();r.json({ok:true})});
app.post("/api/notifications/read-all",auth,checkCsrf,async(_q,r)=>{const at=new Date().toISOString();for(const item of store.notifications)if(!item.readAt)item.readAt=at;await persist();r.json({ok:true})});

app.get("/api/approvals",auth,async(_q,r)=>{
 const expired=approvalPolicy.expirePendingApprovals(store.approvals);
 if(expired.length){for(const item of expired){audit("approval.expired","Approval expired: "+item.title);notify("approval","Approval request expired",item.title)}await persist()}
 r.set("Cache-Control","no-store");r.json({approvals:store.approvals});
});
app.post("/api/approvals",auth,checkCsrf,async(q,r)=>{
 const validation=approvalPolicy.validateApprovalRequest(q.body||{});
 if(!validation.ok)return r.status(400).json({error:validation.error});
 const pending=store.approvals.filter(item=>item.status==="pending"&&!approvalPolicy.isExpired(item)).length;
 if(pending>=50)return r.status(429).json({error:"Approval queue limit reached. Review pending requests first."});
 const now=new Date(),item={id:crypto.randomUUID(),...validation.value,status:"pending",policyVersion:1,approvalRequired:true,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+approvalPolicy.DEFAULT_TTL_MS).toISOString(),reviewedAt:null,reviewedBy:"operator"};
 store.approvals.unshift(item);store.approvals=store.approvals.slice(0,200);
 audit("approval.created","Approval requested: "+item.title+" ["+item.actionType+"/"+item.risk+"]");
 notify("approval","Approval awaiting review",item.title);await persist();r.status(201).json({approval:item});
});
app.patch("/api/approvals/:id",auth,checkCsrf,async(q,r)=>{
 const{decision}=q.body||{};if(!["approved","rejected"].includes(decision))return r.status(400).json({error:"Decision must be approved or rejected"});
 const item=store.approvals.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Request not found"});
 if(item.status!=="pending")return r.status(409).json({error:"Request already reviewed"});
 if(approvalPolicy.isExpired(item)){item.status="expired";item.expiredAt=new Date().toISOString();audit("approval.expired","Approval expired: "+item.title);await persist();return r.status(409).json({error:"Approval request expired. Create a new request if still needed."})}
 item.status=decision;item.reviewedAt=new Date().toISOString();item.reviewedBy="operator";
 audit("approval."+decision,item.title+" was "+decision);notify("approval","Approval "+decision,item.title);await persist();r.json({approval:item});
});

app.get("/api/tasks",auth,(q,r)=>{const data=taskIntel.summarizeTasks(store.tasks);const status=q.query.status;if(status&&status!=="all")data.tasks=data.tasks.filter(t=>t.status===status);r.set("Cache-Control","no-store");r.json(data)});
app.get("/api/tasks/insights",auth,(_q,r)=>{const data=taskIntel.summarizeTasks(store.tasks);r.set("Cache-Control","no-store");r.json({summary:data.summary,topTasks:data.tasks.slice(0,5),categories:taskIntel.CATEGORIES.map(category=>({category,count:store.tasks.filter(t=>t.category===category&&["queued","in_progress"].includes(t.status)).length}))})});
app.post("/api/tasks",auth,checkCsrf,async(q,r)=>{if(store.tasks.length>=200)return r.status(409).json({error:"Task limit reached (200)"});const result=taskIntel.createTask(q.body||{},store.tasks);if(result.error)return r.status(400).json({error:result.error});const task=result.value;store.tasks.unshift(task);audit("task.created","Task queued: "+task.title);notify("task","Task added to queue",task.title);await persist();r.status(201).json({task:{...task,...taskIntel.scoreTask(task,store.tasks)}})});
app.patch("/api/tasks/:id",auth,checkCsrf,async(q,r)=>{const index=store.tasks.findIndex(x=>x.id===q.params.id);if(index<0)return r.status(404).json({error:"Task not found"});const result=taskIntel.validateTaskUpdate(store.tasks[index],q.body||{},store.tasks);if(result.error)return r.status(409).json({error:result.error});store.tasks[index]=result.value;audit("task.updated","Task updated: "+result.value.title);if(result.value.status==="completed")notify("task","Task completed",result.value.title);await persist();r.json({task:{...result.value,...taskIntel.scoreTask(result.value,store.tasks)}})});
app.get("/api/focus",auth,(_q,r)=>{const data=focusEngine.summarizeSessions(store.focusSessions);r.set("Cache-Control","no-store");r.json(data)});
app.post("/api/focus",auth,checkCsrf,async(q,r)=>{if(store.focusSessions.some(x=>x.status==="running"))return r.status(409).json({error:"Pause or complete the running focus session first"});if(store.focusSessions.length>=300)store.focusSessions=store.focusSessions.filter(x=>["running","paused"].includes(x.status)).concat(store.focusSessions.filter(x=>["completed","cancelled"].includes(x.status)).slice(-250));const result=focusEngine.createSession(q.body||{},store.tasks);if(result.error)return r.status(400).json({error:result.error});store.focusSessions.unshift(result.value);audit("focus.started","Focus session started: "+result.value.title);notify("focus","Focus session started",result.value.title);await persist();r.status(201).json({session:focusEngine.presentSession(result.value)})});
app.patch("/api/focus/:id",auth,checkCsrf,async(q,r)=>{const index=store.focusSessions.findIndex(x=>x.id===q.params.id);if(index<0)return r.status(404).json({error:"Focus session not found"});if(q.body&&q.body.action==="resume"&&store.focusSessions.some((x,i)=>i!==index&&x.status==="running"))return r.status(409).json({error:"Another focus session is already running"});const result=focusEngine.transitionSession(store.focusSessions[index],q.body&&q.body.action);if(result.error)return r.status(409).json({error:result.error});store.focusSessions[index]=result.value;const action=q.body.action;audit("focus."+action,"Focus session "+action+": "+result.value.title);if(action==="complete")notify("focus","Focus session completed",result.value.title);await persist();r.json({session:focusEngine.presentSession(result.value)})});
app.get("/api/focus/insights",auth,(_q,r)=>{const data=focusEngine.summarizeSessions(store.focusSessions);r.set("Cache-Control","no-store");r.json({summary:data.summary,daily:data.daily})});
app.get("/api/operations/snapshot",auth,(_q,r)=>{const snapshot=workflowEngine.buildOperationsSnapshot({reminders:store.reminders,workflows:store.workflows,tasks:store.tasks});r.set("Cache-Control","no-store");r.json({snapshot})});
app.get("/api/reminders",auth,(_q,r)=>{const result=workflowEngine.summarizeReminders(store.reminders);r.set("Cache-Control","no-store");r.json(result)});
app.post("/api/reminders",auth,checkCsrf,async(q,r)=>{if(store.reminders.length>=300)return r.status(409).json({error:"Reminder limit reached (300)"});const result=workflowEngine.createReminder(q.body||{});if(result.error)return r.status(400).json({error:result.error});store.reminders.unshift(result.value);audit("reminder.created","Reminder created: "+result.value.title);notify("reminder","Reminder scheduled",result.value.title);await persist();r.status(201).json({reminder:result.value})});
app.patch("/api/reminders/:id",auth,checkCsrf,async(q,r)=>{const item=store.reminders.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Reminder not found"});if(item.status!=="active")return r.status(409).json({error:"Only active reminders can be updated"});const action=q.body&&q.body.action;if(action==="complete"){item.status="completed";item.completedAt=new Date().toISOString();item.updatedAt=item.completedAt;if(item.recurrence==="daily"||item.recurrence==="weekly"){const nextDue=new Date(Date.parse(item.dueAt)+(item.recurrence==="daily"?86400000:604800000));store.reminders.unshift({...item,id:crypto.randomUUID(),dueAt:nextDue.toISOString(),status:"active",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completedAt:null,snoozeCount:0,parentId:item.id})}audit("reminder.completed","Reminder completed: "+item.title);notify("reminder","Reminder completed",item.title)}else if(action==="snooze"){const minutes=Number(q.body.minutes);if(!Number.isInteger(minutes)||minutes<5||minutes>10080)return r.status(400).json({error:"Snooze must be 5–10080 minutes"});item.dueAt=new Date(Date.now()+minutes*60000).toISOString();item.updatedAt=new Date().toISOString();item.snoozeCount=(item.snoozeCount||0)+1;audit("reminder.snoozed","Reminder snoozed: "+item.title)}else return r.status(400).json({error:"Unsupported reminder action"});await persist();r.json({reminder:item})});
app.delete("/api/reminders/:id",auth,checkCsrf,async(q,r)=>{const n=store.reminders.length;store.reminders=store.reminders.filter(x=>x.id!==q.params.id);if(n===store.reminders.length)return r.status(404).json({error:"Reminder not found"});audit("reminder.deleted","Reminder deleted");await persist();r.json({ok:true})});
app.get("/api/workflows",auth,(_q,r)=>{r.set("Cache-Control","no-store");r.json({templates:Object.entries(workflowEngine.TEMPLATES).map(([id,x])=>({id,title:x.title,description:x.description,steps:x.steps.length})),workflows:store.workflows.slice(0,50)})});
app.post("/api/workflows",auth,checkCsrf,async(q,r)=>{if(store.workflows.filter(x=>["active","paused"].includes(x.status)).length>=20)return r.status(409).json({error:"Active workflow limit reached (20)"});const result=workflowEngine.createWorkflow(q.body||{});if(result.error)return r.status(400).json({error:result.error});store.workflows.unshift(result.value);audit("workflow.created","Workflow created: "+result.value.title);notify("workflow","Workflow created",result.value.title);await persist();r.status(201).json({workflow:result.value})});
app.patch("/api/workflows/:id/steps/:stepId",auth,checkCsrf,async(q,r)=>{const item=store.workflows.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Workflow not found"});const result=workflowEngine.updateWorkflowStep(item,q.params.stepId,q.body&&q.body.status);if(result.error)return r.status(409).json({error:result.error});audit("workflow.step_updated","Workflow step updated: "+item.title);if(item.status==="completed")notify("workflow","Workflow completed",item.title);await persist();r.json({workflow:item})});
app.patch("/api/workflows/:id",auth,checkCsrf,async(q,r)=>{const item=store.workflows.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Workflow not found"});const result=workflowEngine.setWorkflowStatus(item,q.body&&q.body.status);if(result.error)return r.status(409).json({error:result.error});audit("workflow."+item.status,"Workflow "+item.status+": "+item.title);await persist();r.json({workflow:item})});
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
app.get("/api/memory",auth,(q,r)=>{
 const result=memorySearch.searchMemories(store.memories,{query:q.query.query||q.query.q||"",category:q.query.category||"all",limit:q.query.limit||100,offset:q.query.offset||0,from:q.query.from,to:q.query.to,pinned:q.query.pinned});
 if(result.error)return r.status(400).json({error:result.error});
 r.set("Cache-Control","no-store");r.json(result);
});
app.get("/api/memory/stats",auth,(_q,r)=>{
 r.set("Cache-Control","no-store");r.json({stats:memoryRecords.buildMemoryStats(store.memories)});
});
app.get("/api/memory/search",auth,(q,r)=>{
 const result=memorySearch.searchMemories(store.memories,{query:q.query.query||q.query.q||"",category:q.query.category||"all",limit:q.query.limit||20,offset:q.query.offset||0,from:q.query.from,to:q.query.to,pinned:q.query.pinned});
 if(result.error)return r.status(400).json({error:result.error});
 r.set("Cache-Control","no-store");r.json(result);
});
app.post("/api/memory",auth,checkCsrf,async(q,r)=>{
 const validated=memoryRecords.validateMemoryInput(q.body||{});
 if(validated.error)return r.status(400).json({error:validated.error});
 const now=new Date().toISOString(),item={id:crypto.randomUUID(),...validated.value,createdAt:now,updatedAt:now,createdBy:"operator"};
 store.memories.unshift(item);store.memories=store.memories.slice(0,200);
 audit("memory.created","Knowledge record saved ("+item.category+", "+item.importance+")");notify("memory","Knowledge saved",item.title||item.category+" record added to your vault");
 await persist();r.status(201).json({memory:item});
});
app.patch("/api/memory/:id",auth,checkCsrf,async(q,r)=>{
 const item=store.memories.find(x=>x.id===q.params.id);if(!item)return r.status(404).json({error:"Memory not found"});
 const validated=memoryRecords.validateMemoryInput(q.body||{},{partial:true});
 if(validated.error)return r.status(400).json({error:validated.error});
 Object.assign(item,validated.value,{updatedAt:new Date().toISOString()});
 audit("memory.updated","Knowledge record updated ("+item.id+")");await persist();r.json({memory:item});
});
app.delete("/api/memory/:id",auth,checkCsrf,async(q,r)=>{
 const before=store.memories.length;store.memories=store.memories.filter(x=>x.id!==q.params.id);
 if(before===store.memories.length)return r.status(404).json({error:"Memory not found"});
 audit("memory.deleted","A knowledge record was deleted");notify("memory","Memory deleted","A knowledge record was removed");
 await persist();r.json({ok:true});
});
app.get("/api/audit",auth,(q,r)=>r.json({events:store.audit.slice(0,Math.min(Math.max(Number(q.query.limit)||50,1),100))}));
app.get("/api/system/configuration",auth,(_q,r)=>{r.set("Cache-Control","no-store");r.json({configuration:buildConfigurationReport(process.env)});});
app.get("/api/security/center",auth,async(_q,r)=>{
 const expired=approvalPolicy.expirePendingApprovals(store.approvals);
 if(expired.length){for(const item of expired)audit("approval.expired","Approval expired: "+item.title);await persist()}
 const approvalQueue={pending:store.approvals.filter(x=>x.status==="pending").length,approved:store.approvals.filter(x=>x.status==="approved").length,rejected:store.approvals.filter(x=>x.status==="rejected").length,expired:store.approvals.filter(x=>x.status==="expired").length};
 const recentSecurityEvents=store.audit.filter(x=>/auth|approval|session|security|oauth/i.test(x.event)).slice(0,12);
 r.set("Cache-Control","no-store");r.json({generatedAt:new Date().toISOString(),posture:"operator_controlled",externalExecution:"disabled",approvalTtlHours:approvalPolicy.DEFAULT_TTL_MS/3600000,approvalQueue,limits:{maxPendingApprovals:50,maxStoredApprovals:200,sessionHours:8},controls:{csrf:"enabled",httpOnlySession:"enabled",sameSite:"strict",passwordHash:"scrypt",externalWrites:"disabled",trading:"simulation_only"},recentSecurityEvents});
});
app.get("/api/system/diagnostics",auth,async(_q,r)=>{
 let database={status:"local_json",durable:false};
 if(pool){try{await pool.query("SELECT 1");database={status:"connected",durable:true}}catch{database={status:"unavailable",durable:false}}}
 const checks=[
  {id:"database",label:"Primary storage",status:database.status,detail:database.durable?"PostgreSQL connection verified":"Local JSON fallback is not durable on ephemeral hosting"},
  {id:"sessions",label:"Login sessions",status:pool?"postgres_persistent":"memory_only",detail:pool?"Session hashes and expiry are stored in PostgreSQL":"Sessions are process-local in development mode"},
  {id:"ai",label:"AI provider",status:(String(process.env.AI_PROVIDER||(process.env.GEMINI_API_KEY?"gemini":"openai")).toLowerCase()==="gemini"?!!process.env.GEMINI_API_KEY:!!process.env.OPENAI_API_KEY)?"configured":"not_configured",detail:"Active provider key presence is checked without exposing its value"},
  {id:"gmail",label:"Gmail",status:googleOAuth.config()?"oauth_ready":"not_configured",detail:"Read-only Gmail OAuth; email sending is not enabled"},
  {id:"calendar",label:"Google Calendar",status:googleOAuth.config()?"oauth_ready":"not_configured",detail:"Read-only Calendar OAuth; event changes are not enabled"},
  {id:"worker",label:"Background job worker",status:pool?"active":"postgres_required",detail:pool?"PostgreSQL-backed worker processes allowlisted internal maintenance jobs":"Configure PostgreSQL to enable durable background jobs"},
  {id:"execution",label:"External action execution",status:"disabled",detail:"Approval records do not execute external actions"}
 ];
 r.set("Cache-Control","no-store");r.json({name:"ULTRON",checkedAt:new Date().toISOString(),checks,secureMode:true});
});
app.get("/api/export",auth,async(_q,r)=>{
 const backup={format:"ultron-backup",schemaVersion:1,exportedAt:new Date().toISOString(),data:{approvals:store.approvals,audit:store.audit,tasks:store.tasks,memories:store.memories,notifications:store.notifications,focusSessions:store.focusSessions,reminders:store.reminders,workflows:store.workflows}};
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 r.set("Cache-Control","no-store");r.set("Content-Type","application/json; charset=utf-8");r.set("Content-Disposition",'attachment; filename="ultron-backup-'+stamp+'.json"');r.send(JSON.stringify(backup,null,2));
});

app.get("/api/assistant/status",auth,(_q,r)=>{const provider=String(process.env.AI_PROVIDER||(process.env.GEMINI_API_KEY?"gemini":"openai")).toLowerCase();const model=provider==="gemini"?(process.env.GEMINI_MODEL||"gemini-3.8-flash"):(process.env.OPENAI_MODEL||"gpt-6.2-astra");const configured=provider==="gemini"?!!process.env.GEMINI_API_KEY:provider==="openai"?!!process.env.OPENAI_API_KEY:false;r.json({configured,provider,model,voiceConfigured:!!(String(process.env.ELEVENLABS_API_KEY||"").trim()&&String(process.env.ELEVENLABS_VOICE_ID||"").trim()),voiceApiKeyConfigured:!!String(process.env.ELEVENLABS_API_KEY||"").trim(),voiceIdConfigured:!!String(process.env.ELEVENLABS_VOICE_ID||"").trim(),toolsEnabled:false,conversationStorage:"client-session-only"});});
app.get("/api/assistant/context-preview",auth,(q,r)=>{
 const query=String(q.query||"").slice(0,2000);
 const context=assistantContext.buildAssistantContext({messages:[{role:"user",content:query}],memories:store.memories,tasks:store.tasks,approvals:store.approvals});
 const preview={...context.summary,relevantMemoryTitles:(store.memories||[]).filter(item=>context.retrievedMemoryIds.includes(item.id)).map(item=>String(item.title||item.category).slice(0,100)),activeTasks:(store.tasks||[]).filter(item=>["queued","in_progress"].includes(item.status)).length};
 r.set("Cache-Control","no-store");r.json({context:preview});
});
app.post("/api/assistant/chat",auth,checkCsrf,chatLimiter,async(q,r)=>{
 const messages=q.body&&q.body.messages;
 if(!Array.isArray(messages)||messages.length<1||messages.length>12)return r.status(400).json({error:"Send between 1 and 12 recent messages"});
 const valid=messages.every(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string"&&m.content.trim().length>0&&m.content.length<=4000);
 if(!valid||messages[messages.length-1].role!=="user")return r.status(400).json({error:"Invalid message history"});
 try{
  const context=assistantContext.buildAssistantContext({messages,memories:store.memories,tasks:store.tasks,approvals:store.approvals});
  const result=await generateAssistantReply(messages,context.prompt);
  r.set("Cache-Control","no-store");r.json({reply:result.text,model:result.model,contextSummary:context.summary});
 }
 catch(e){r.status(e.status||502).json({error:e.message||"Assistant provider unavailable"})}
});
app.post("/api/assistant/speech",auth,checkCsrf,chatLimiter,async(q,r)=>{
 const text=typeof (q.body&&q.body.text)==="string"?q.body.text.trim():"";
 if(!text||text.length>1500)return r.status(400).json({error:"Voice text must contain between 1 and 1500 characters."});
 try{
  const result=await synthesizeSpeech(text);
  r.set("Cache-Control","no-store");
  r.set("Content-Type",result.contentType);
  r.set("X-Content-Type-Options","nosniff");
  r.set("Content-Length",String(result.audio.length));
  r.status(200).send(result.audio);
 }catch(error){r.status(error.status||502).json({error:error.message||"Voice generation unavailable"});}
});
app.get("/api/status",(_q,r)=>r.json({status:"online",name:"ULTRON"}));
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"],maxAge:process.env.NODE_ENV==="production"?"1h":0,setHeaders(res,filePath){if(filePath.endsWith(".html"))res.setHeader("Cache-Control","no-cache")}}));
app.use((q,r)=>q.path.startsWith("/api/")?r.status(404).json({error:"API route not found"}):r.status(404).type("text").send("Not found"));
app.use((e,q,r,_n)=>{const status=httpSafety.errorStatus(e);console.error("Request error:",{method:q.method,path:q.path,status,errorName:String(e&&e.name||"Error").slice(0,80),errorCode:String(e&&e.code||"").slice(0,40)});if(r.headersSent)return; r.status(status).json({error:httpSafety.publicError(status)})});
const productionConfigErrors=validateProductionEnvironment(process.env);
if(productionConfigErrors.length){console.error("ULTRON startup blocked: invalid production configuration:",productionConfigErrors);process.exit(1)}
load().then(async()=>{
const seeded=await bootstrapAdmin({store,persist,audit,hashPassword,env:process.env});if(seeded)console.info("ULTRON initial administrator provisioned");
const worker=pool?createJobWorker({pool,concurrency:2,pollMs:2000}):null;if(worker)worker.start();
const server=app.listen(PORT,HOST,()=>console.info("ULTRON v2.2 running on "+HOST+":"+PORT+" | storage: "+(pool?"PostgreSQL":"local JSON")+" | worker: "+(worker?"active":"disabled")));
const shutdown=createShutdownHandler({server,worker,pool});process.on("SIGTERM",()=>{void shutdown("SIGTERM")});process.on("SIGINT",()=>{void shutdown("SIGINT")})}).catch(e=>{console.error("ULTRON startup failed:",{errorName:String(e&&e.name||"Error"),errorCode:String(e&&e.code||"STARTUP_FAILURE")});process.exit(1)});
