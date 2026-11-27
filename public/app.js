const $=id=>document.getElementById(id);
let csrfToken="",authMode="login",currentUser=null,chatMessages=[],chatReady=false;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast=message=>{const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600)};
const prettyTime=value=>{try{return new Date(value).toLocaleString([],{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"})}catch{return"just now"}};
function clock(){const n=new Date();$("clock").textContent=n.toLocaleTimeString([],{hour12:false});$("date").textContent=n.toLocaleDateString([],{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).toUpperCase()}
clock();setInterval(clock,1000);
async function api(url,options={}){const headers={Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})};if(options.method&&options.method!=="GET"&&csrfToken)headers["X-CSRF-Token"]=csrfToken;const response=await fetch(url,{credentials:"same-origin",...options,headers});const data=await response.json().catch(()=>({error:"Unexpected server response"}));if(!response.ok)throw new Error(data.error||"Request failed");return data}
async function refreshCsrf(){const b=await api("/api/auth/bootstrap");csrfToken=b.csrfToken;return b}
function setAuthScreen(show){$("auth-screen").classList.toggle("visible",show);$("logout-btn").hidden=show}
function showAuthMode(configured){authMode=configured?"login":"setup";$("auth-eyebrow").textContent=configured?"IDENTITY VERIFICATION":"FIRST-TIME INITIALIZATION";$("auth-title").innerHTML=configured?"Operator <span>Access</span>":"Initialize <span>ULTRON</span>";$("auth-description").textContent=configured?"Sign in to access your private command center.":"Create the first administrator. Your one-time setup key comes from the server environment."; $("setup-key-label").hidden=configured;$("auth-password").autocomplete=configured?"current-password":"new-password";$("auth-submit").textContent=configured?"SECURE SIGN IN →":"CREATE ADMINISTRATOR →";$("auth-error").textContent="";setAuthScreen(true)}
async function initializeAuth(){try{const b=await refreshCsrf();const me=await api("/api/auth/me");if(me.authenticated){currentUser=me.user;setAuthScreen(false);await refreshCsrf();$("connection-label").textContent="OPERATOR VERIFIED";$("logout-btn").hidden=false;loadDashboard();loadApprovals();loadAssistantStatus();loadTasks();loadJobs();loadMemories();loadDiagnostics();loadAudit();loadGoogleIntegrations();loadBriefing();loadIntelligence();loadAgents();loadNotifications();loadConfiguration();loadSecurityCenter()}else showAuthMode(b.configured)}catch(e){showAuthMode(true);$("auth-error").textContent="API CONNECTION ERROR: "+e.message}}
$("auth-form").addEventListener("submit",async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const payload={username:form.get("username"),password:form.get("password")};if(authMode==="setup")payload.setupKey=form.get("setupKey");$("auth-submit").disabled=true;$("auth-error").textContent="VERIFYING CREDENTIALS…";try{await api(authMode==="setup"?"/api/auth/setup":"/api/auth/login",{method:"POST",body:JSON.stringify(payload)});await refreshCsrf();const me=await api("/api/auth/me");currentUser=me.user;setAuthScreen(false);$("connection-label").textContent="OPERATOR VERIFIED";$("logout-btn").hidden=false;toast("SECURE SESSION ESTABLISHED");loadDashboard();loadApprovals();loadAssistantStatus();loadTasks();loadJobs();loadMemories();loadDiagnostics();loadAudit();loadGoogleIntegrations();loadBriefing();loadIntelligence();loadAgents();loadNotifications();loadConfiguration();loadSecurityCenter()}catch(e){$("auth-error").textContent=e.message}finally{$("auth-submit").disabled=false}});
$("logout-btn").addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST"});currentUser=null;await refreshCsrf();showAuthMode(true);toast("SESSION TERMINATED")}catch(e){toast(e.message)}});
async function loadDashboard(){const started=performance.now();try{const [health,overview]=await Promise.all([api("/api/health"),api("/api/overview")]);$("connection-label").textContent="SYSTEM ONLINE";$("api-status").textContent="CONNECTED";$("api-status").className="status-value good";$("latency").textContent=Math.round(performance.now()-started)+" ms";$("uptime").textContent=health.uptimeSeconds+"s";$("last-check").textContent=prettyTime(health.timestamp);$("agent-list").innerHTML=overview.agents.map(a=>{const c=a.state==="planned"?"planned":a.state==="simulation"?"simulation":"";return'<div class="agent-row"><span class="agent-glyph">◈</span><div><b>'+escapeHtml(a.name)+'</b><small>'+escapeHtml(a.id)+'</small></div><span class="agent-state '+c+'">'+escapeHtml(a.state.toUpperCase())+'</span></div>'}).join("");$("activity-list").innerHTML=overview.activity.map(a=>'<div class="activity-item"><i></i><div><b>'+escapeHtml(a.label)+'</b><small>'+escapeHtml(a.kind)+' · '+prettyTime(a.time)+'</small></div></div>').join("")||'<div class="empty-state">No events recorded.</div>'}catch(e){$("connection-label").textContent="API OFFLINE";$("api-status").textContent="UNAVAILABLE";$("api-status").className="status-value warn";$("last-check").textContent="RETRY REQUIRED"}}
async function loadAssistantStatus(){try{const status=await api("/api/assistant/status");chatReady=status.configured;$("chat-provider-status").textContent=status.configured?"AI PROVIDER READY · "+status.model.toUpperCase():"OPENAI API KEY REQUIRED";$("chat-provider-status").style.color=status.configured?"var(--green)":"var(--amber)";$("chat-send").disabled=!status.configured;$("chat-input").placeholder=status.configured?"Send a message to ULTRON…":"Add OPENAI_API_KEY to server environment to enable chat."}catch(e){chatReady=false;$("chat-provider-status").textContent="SIGN IN REQUIRED";$("chat-send").disabled=true}}
function renderChat(){const el=$("chat-transcript");el.innerHTML=chatMessages.map(m=>'<div class="chat-message '+m.role+'"><span class="chat-avatar">'+(m.role==="assistant"?"U":"OP")+'</span><div><b>'+(m.role==="assistant"?"ULTRON CORE":"OPERATOR")+'</b><p>'+escapeHtml(m.content).replace(/\\n/g,"<br>")+'</p></div></div>').join("")||'<div class="empty-state">No messages in this session yet.</div>';el.scrollTop=el.scrollHeight}

async function loadTasks(){try{const data=await api("/api/tasks");$("task-list").innerHTML=data.tasks.length?data.tasks.map(t=>'<article class="workspace-item"><div><b>'+escapeHtml(t.title)+'</b><p>'+escapeHtml(t.details||"No details")+'</p><small>'+escapeHtml(t.priority.toUpperCase())+' PRIORITY · '+prettyTime(t.createdAt)+'</small></div><select data-task-status="'+escapeHtml(t.id)+'" '+(["completed","cancelled"].includes(t.status)?"disabled":"")+'><option value="queued" '+(t.status==="queued"?"selected":"")+'>QUEUED</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>IN PROGRESS</option><option value="completed" '+(t.status==="completed"?"selected":"")+'>COMPLETED</option><option value="cancelled" '+(t.status==="cancelled"?"selected":"")+'>CANCELLED</option></select></article>').join(""):'<div class="empty-state">No tasks yet. Add your first task above.</div>'}catch(e){$("task-list").innerHTML='<div class="empty-state">'+escapeHtml(e.message)+'</div>'}}

async function loadJobs(){
 try{
  const data=await api("/api/jobs");
  const counts=Object.fromEntries((data.counts||[]).map(x=>[x.status,x.count]));
  $("job-counts").innerHTML=["queued","running","completed","failed"].map(k=>'<span>'+k.toUpperCase()+' <b>'+Number(counts[k]||0)+'</b></span>').join("");
  $("job-list").innerHTML=data.jobs.length?data.jobs.map(j=>'<article class="job-row"><div class="job-main"><b>'+escapeHtml(j.job_type.replaceAll("."," / ").replaceAll("_"," ").toUpperCase())+'</b><small>'+prettyTime(j.created_at)+' · ATTEMPT '+j.attempts+'/'+j.max_attempts+'</small>'+(j.last_error?'<p class="job-error">'+escapeHtml(j.last_error)+'</p>':j.result?'<p>'+escapeHtml(JSON.stringify(j.result))+'</p>':'')+'</div><span class="job-status '+escapeHtml(j.status)+'">'+escapeHtml(j.status.toUpperCase())+'</span></article>').join(""):'<div class="empty-state">No maintenance jobs yet. Queue a safe internal job above.</div>';
 }catch(error){$("job-list").innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>';$("job-counts").innerHTML='<span>POSTGRESQL REQUIRED</span>'}
}
$("job-form").addEventListener("submit",async e=>{e.preventDefault();const form=new FormData(e.currentTarget);try{await api("/api/jobs",{method:"POST",body:JSON.stringify(Object.fromEntries(form.entries()))});await loadJobs();loadDashboard();toast("MAINTENANCE JOB QUEUED")}catch(error){toast(error.message)}});
$("jobs-refresh").addEventListener("click",()=>{loadJobs();toast("JOB QUEUE REFRESHED")});

async function loadMemories(){try{const data=await api("/api/memory");$("memory-list").innerHTML=data.memories.length?data.memories.map(m=>'<article class="workspace-item"><div><b>'+escapeHtml(m.category.toUpperCase())+'</b><p>'+escapeHtml(m.content)+'</p><small>'+prettyTime(m.createdAt)+'</small></div><button type="button" data-delete-memory="'+escapeHtml(m.id)+'" aria-label="Delete memory">DELETE</button></article>').join(""):'<div class="empty-state">No memories saved yet.</div>'}catch(e){$("memory-list").innerHTML='<div class="empty-state">'+escapeHtml(e.message)+'</div>'}}
$("task-form").addEventListener("submit",async e=>{e.preventDefault();const form=new FormData(e.currentTarget);try{await api("/api/tasks",{method:"POST",body:JSON.stringify(Object.fromEntries(form.entries()))});e.currentTarget.reset();await loadTasks();loadDashboard();toast("TASK ADDED TO QUEUE")}catch(err){toast(err.message)}});
$("task-list").addEventListener("change",async e=>{const id=e.target.dataset.taskStatus;if(!id)return;try{await api("/api/tasks/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:e.target.value})});await loadTasks();loadDashboard();toast("TASK STATUS UPDATED")}catch(err){toast(err.message);loadTasks()}});
$("memory-form").addEventListener("submit",async e=>{e.preventDefault();const form=new FormData(e.currentTarget);try{await api("/api/memory",{method:"POST",body:JSON.stringify(Object.fromEntries(form.entries()))});e.currentTarget.reset();await loadMemories();loadDashboard();toast("MEMORY SAVED")}catch(err){toast(err.message)}});
$("memory-list").addEventListener("click",async e=>{const b=e.target.closest("button[data-delete-memory]");if(!b)return;if(!confirm("Delete this memory permanently?"))return;try{await api("/api/memory/"+encodeURIComponent(b.dataset.deleteMemory),{method:"DELETE"});await loadMemories();loadDashboard();toast("MEMORY DELETED")}catch(err){toast(err.message)}});

$("export-backup").addEventListener("click",async()=>{
 const button=$("export-backup");button.disabled=true;button.textContent="PREPARING BACKUP…";
 try{const response=await fetch("/api/export",{credentials:"same-origin",headers:{Accept:"application/json"}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"Backup export failed")}const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="ultron-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);toast("BACKUP EXPORTED — STORE IT SAFELY")}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent="↓ EXPORT SECURE BACKUP"}
});

async function loadDiagnostics(){
 try{
  const data=await api("/api/system/diagnostics");
  $("diagnostics-list").innerHTML=data.checks.map(item=>{
   const good=["connected","configured"].includes(item.status),warn=["not_configured","local_json","not_connected","disabled"].includes(item.status);
   const state=good?"good":warn?"warn":"bad";
   return '<article class="diagnostic-row"><div><b>'+escapeHtml(item.label)+'</b><small>'+escapeHtml(item.detail)+'</small></div><span class="diagnostic-state '+state+'">'+escapeHtml(item.status.replaceAll("_"," ").toUpperCase())+'</span></article>';
  }).join("");
 }catch(error){$("diagnostics-list").innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
}
async function loadSecurityCenter(){
 const root=$("security-posture");if(!root)return;
 try{
  const data=await api("/api/security/center"),q=data.approvalQueue,c=data.controls;
  root.innerHTML='<div class="security-live-grid"><div><b>'+q.pending+'</b><small>PENDING</small></div><div><b>'+q.approved+'</b><small>APPROVED</small></div><div><b>'+q.rejected+'</b><small>REJECTED</small></div><div><b>'+q.expired+'</b><small>EXPIRED</small></div></div><div class="security-live-lines"><p><span>Session protection</span><b>'+escapeHtml(c.passwordHash.toUpperCase())+'</b></p><p><span>CSRF protection</span><b>'+escapeHtml(c.csrf.toUpperCase())+'</b></p><p><span>External write executor</span><b>DISABLED</b></p><p><span>Trading mode</span><b>SIMULATION ONLY</b></p><p><span>Approval expiry</span><b>'+data.approvalTtlHours+' HOURS</b></p></div>';
 }catch(error){root.innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
}
async function loadAudit(){
 try{
  const data=await api("/api/audit?limit=30");
  $("audit-list").innerHTML=data.events.length?data.events.map(event=>'<article class="audit-row"><span class="audit-marker"></span><div><b>'+escapeHtml(event.event.replaceAll("."," / ").replaceAll("_"," ").toUpperCase())+'</b><p>'+escapeHtml(event.detail)+'</p><small>'+prettyTime(event.at)+'</small></div></article>').join(""):'<div class="empty-state">No audit events recorded yet.</div>';
 }catch(error){$("audit-list").innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
}
$("diagnostics-refresh").addEventListener("click",()=>{loadDiagnostics();toast("DIAGNOSTICS REFRESHED")});
$("audit-refresh").addEventListener("click",()=>{loadAudit();toast("AUDIT TRAIL REFRESHED")});
async function loadApprovals(){try{const data=await api("/api/approvals");const items=data.approvals||[];$("approval-count").textContent=items.length+" REQUESTS";$("approval-list").innerHTML=items.length?items.map(a=>'<article class="approval-item"><div class="approval-item-top"><b>'+escapeHtml(a.title)+'</b><span class="approval-status '+a.status+'">'+escapeHtml(a.status.toUpperCase())+'</span></div><p>'+escapeHtml(a.details||"No additional details")+'</p><div class="approval-meta"><span>'+escapeHtml(a.actionType.replaceAll("_"," ").toUpperCase())+'</span><span class="risk-'+escapeHtml(a.risk)+'">'+escapeHtml(a.risk.toUpperCase())+' RISK</span><span>'+prettyTime(a.createdAt)+'</span></div>'+(a.status==="pending"?'<div class="approval-actions"><button data-review="approved" data-id="'+escapeHtml(a.id)+'">APPROVE RECORD</button><button data-review="rejected" data-id="'+escapeHtml(a.id)+'">REJECT</button></div>':'')+'</article>').join(""):'<div class="empty-state">No approval requests yet. Create one to populate the queue.</div>'}catch(e){$("approval-list").innerHTML='<div class="empty-state">'+escapeHtml(e.message)+'</div>'}}
$("approval-form").addEventListener("submit",async e=>{e.preventDefault();const form=new FormData(e.currentTarget);const payload=Object.fromEntries(form.entries());try{await api("/api/approvals",{method:"POST",body:JSON.stringify(payload)});e.currentTarget.reset();await loadApprovals();loadDashboard();toast("APPROVAL REQUEST CREATED")}catch(err){toast(err.message)}});
$("approval-list").addEventListener("click",async e=>{const button=e.target.closest("button[data-review]");if(!button)return;button.disabled=true;try{await api("/api/approvals/"+encodeURIComponent(button.dataset.id),{method:"PATCH",body:JSON.stringify({decision:button.dataset.review})});await loadApprovals();loadDashboard();toast("REQUEST "+button.dataset.review.toUpperCase())}catch(err){toast(err.message);button.disabled=false}});
$("refresh-btn").addEventListener("click",()=>{loadDashboard();loadApprovals();loadAssistantStatus();loadTasks();loadJobs();loadMemories();loadDiagnostics();loadAudit();loadGoogleIntegrations();loadBriefing();loadIntelligence();loadAgents();loadNotifications();loadConfiguration();loadSecurityCenter();toast("SYSTEM DIAGNOSTICS REFRESHED")});
document.querySelectorAll(".action-tile").forEach(button=>button.addEventListener("click",()=>{const messages={assistant:"OPENING ULTRON CHAT WORKSPACE.",research:"RESEARCH PROVIDER NOT CONNECTED. THIS AGENT IS STANDBY ONLY.",security:"SECURITY ACTIVE. REVIEW REQUESTS IN THE APPROVAL CENTER BELOW.",integrations:"EXTERNAL ACCOUNTS ARE NOT LINKED. NO THIRD-PARTY ACTIONS ARE ACTIVE."};$("action-feedback").textContent=messages[button.dataset.action]||"MODULE NOT AVAILABLE.";if(button.dataset.action==="assistant")$("assistant-chat").scrollIntoView({behavior:"smooth",block:"center"});toast("MODULE STATUS UPDATED")}));
document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(x=>x.classList.remove("active"));link.classList.add("active")}));
$("chat-form").addEventListener("submit",async e=>{e.preventDefault();if(!chatReady)return;const input=$("chat-input"),content=input.value.trim();if(!content)return;chatMessages.push({role:"user",content});chatMessages=chatMessages.slice(-12);input.value="";renderChat();$("chat-send").disabled=true;$("chat-provider-status").textContent="ULTRON IS THINKING…";try{const result=await api("/api/assistant/chat",{method:"POST",body:JSON.stringify({messages:chatMessages})});chatMessages.push({role:"assistant",content:result.reply});chatMessages=chatMessages.slice(-12);renderChat();$("chat-provider-status").textContent="AI PROVIDER READY · "+String(result.model).toUpperCase()}catch(err){chatMessages.push({role:"assistant",content:"I could not complete that request: "+err.message});renderChat();$("chat-provider-status").textContent="PROVIDER ERROR"}finally{$("chat-send").disabled=!chatReady}});


async function loadIntelligence(){
 const summary=$("intelligence-summary");if(!summary)return;
 summary.textContent="Analyzing available read-only workspace data…";
 try{
  const {intelligence}=await api("/api/intelligence/workspace"),counts=intelligence.summary;
  summary.textContent=counts.inboxMessages+" inbox samples · "+counts.inboxNeedsAttention+" need attention · "+counts.calendarEvents+" upcoming events · "+counts.calendarConflicts+" overlaps · "+counts.activeTasks+" active tasks · "+counts.pendingApprovals+" pending approvals · "+prettyTime(intelligence.generatedAt);
  $("intelligence-insights").innerHTML=intelligence.insights.map(item=>'<article class="intelligence-insight '+escapeHtml(item.severity)+'"><b>'+escapeHtml(item.title)+'</b><p>'+escapeHtml(item.detail)+'</p></article>').join("");
  $("intelligence-inbox").innerHTML=intelligence.inbox.length?intelligence.inbox.map(item=>'<article class="intelligence-item"><div><b>'+escapeHtml(item.subject||"(No subject)")+'</b><small>'+escapeHtml(item.category.toUpperCase())+' · PRIORITY '+item.priority+(item.unread?" · UNREAD":"")+'</small></div><p>'+escapeHtml(item.from||"Unknown sender")+'</p></article>').join(""):'<div class="empty-state">'+(intelligence.integrations.gmail?"No recent inbox samples.":"Connect Gmail to analyze inbox metadata.")+'</div>';
  $("intelligence-conflicts").innerHTML=intelligence.calendarConflicts.length?intelligence.calendarConflicts.map(item=>'<article class="intelligence-item conflict"><b>'+escapeHtml(item.first.summary||"Event 1")+' ↔ '+escapeHtml(item.second.summary||"Event 2")+'</b><small>'+item.overlapMinutes+' minute overlap</small><p>'+prettyTime(item.first.start)+' · '+prettyTime(item.second.start)+'</p></article>').join(""):'<div class="empty-state">'+(intelligence.integrations.calendar?"No overlapping timed events found.":"Connect Calendar to check schedule conflicts.")+'</div>';
  $("intelligence-focus").innerHTML=intelligence.focusQueue.length?intelligence.focusQueue.map((item,index)=>'<article class="intelligence-item"><div><b>'+(index+1)+'. '+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.priority.toUpperCase())+' PRIORITY · '+escapeHtml(item.status.replaceAll("_"," ").toUpperCase())+'</small></div><span class="focus-score">'+item.score+'</span></article>').join(""):'<div class="empty-state">No active tasks. Add tasks to build your focus queue.</div>';
 }catch(error){summary.textContent="Intelligence analysis unavailable: "+error.message}
}
$("intelligence-refresh")?.addEventListener("click",loadIntelligence);

async function loadAgents(){
 const root=$("registry-grid");if(!root)return;
 try{const data=await api("/api/agents");$("registry-summary").textContent=data.summary.available+" operational · "+data.summary.connected+" connected · "+data.summary.planned+" planned/simulation · "+data.summary.total+" total agents";
 root.innerHTML=data.agents.map(a=>'<article class="registry-card"><div class="registry-card-top"><span class="registry-category">'+escapeHtml(a.category)+'</span><span class="registry-state '+escapeHtml(a.status)+'">'+escapeHtml(a.status.replaceAll("_"," ").toUpperCase())+'</span></div><h3>'+escapeHtml(a.name)+'</h3><p>'+escapeHtml(a.guardrail)+'</p><div class="registry-meta"><b>MODE</b><span>'+escapeHtml(a.mode.replaceAll("_"," ").toUpperCase())+'</span></div><div class="registry-meta"><b>CAPABILITIES</b><span>'+a.capabilities.map(escapeHtml).join(" · ")+'</span></div><div class="registry-meta"><b>PERMISSIONS</b><span>'+a.permissions.map(escapeHtml).join(" · ")+'</span></div></article>').join("");
 }catch(e){$("registry-summary").textContent="Registry unavailable";root.innerHTML='<div class="empty-state">'+escapeHtml(e.message)+'</div>'}
}
async function loadNotifications(){
 const root=$("notification-list");if(!root)return;
 try{const data=await api("/api/notifications");$("notification-badge").textContent=String(data.unread);$("notification-summary").textContent=data.unread+" unread · "+data.notifications.length+" recent notifications";
 root.innerHTML=data.notifications.length?data.notifications.map(n=>'<article class="notification-item '+(n.readAt?"read":"unread")+'"><span class="notification-mark"></span><div class="notification-copy"><b>'+escapeHtml(n.title)+'</b><p>'+escapeHtml(n.message)+'</p><small>'+escapeHtml(n.type.toUpperCase())+' · '+prettyTime(n.createdAt)+'</small></div><div class="notification-actions">'+(!n.readAt?'<button data-notification-read="'+escapeHtml(n.id)+'">MARK READ</button>':'')+'<button data-notification-delete="'+escapeHtml(n.id)+'">DISMISS</button></div></article>').join(""):'<div class="empty-state">All quiet. New ULTRON events will appear here.</div>';
 }catch(e){root.innerHTML='<div class="empty-state">'+escapeHtml(e.message)+'</div>'}
}
$("agents-refresh")?.addEventListener("click",loadAgents);
$("notifications-refresh")?.addEventListener("click",loadNotifications);
$("notifications-read-all")?.addEventListener("click",async()=>{try{await api("/api/notifications/read-all",{method:"POST",body:"{}"});await loadNotifications();toast("ALL NOTIFICATIONS MARKED READ")}catch(e){toast(e.message)}});
$("notification-list")?.addEventListener("click",async event=>{const read=event.target.closest("[data-notification-read]"),remove=event.target.closest("[data-notification-delete]");try{if(read)await api("/api/notifications/"+encodeURIComponent(read.dataset.notificationRead),{method:"PATCH",body:"{}"});else if(remove)await api("/api/notifications/"+encodeURIComponent(remove.dataset.notificationDelete),{method:"DELETE"});else return;await loadNotifications()}catch(e){toast(e.message)}});

async function loadBriefing(){
 const summary=$("briefing-summary");if(!summary)return;
 summary.textContent="Collecting your latest Google and ULTRON data…";
 try{
  const {briefing}=await api("/api/briefing");
  summary.textContent=briefing.summary+" · Generated "+prettyTime(briefing.generatedAt);
  $("briefing-notices").innerHTML=(briefing.notices||[]).map(item=>'<div class="briefing-notice '+escapeHtml(item.type)+'">'+escapeHtml(item.text)+'</div>').join("");
  $("briefing-calendar").innerHTML=briefing.calendar.items.length?briefing.calendar.items.map(item=>'<article class="briefing-item"><b>'+escapeHtml(item.summary)+'</b><small>'+escapeHtml(item.start?prettyTime(item.start):"Time not set")+'</small>'+(item.location?'<p>'+escapeHtml(item.location)+'</p>':'')+'</article>').join(""):'<div class="empty-state">'+(briefing.calendar.connected?"No upcoming events.":"Connect Google Calendar to view events.")+'</div>';
  $("briefing-gmail").innerHTML=briefing.gmail.items.length?briefing.gmail.items.map(item=>'<article class="briefing-item"><b>'+escapeHtml(item.subject)+'</b><small>'+escapeHtml(item.from)+' · '+escapeHtml(item.date)+'</small><p>'+escapeHtml(item.snippet)+'</p>'+(item.unread?'<em>UNREAD</em>':'')+'</article>').join(""):'<div class="empty-state">'+(briefing.gmail.connected?"No recent messages.":"Connect Gmail to view inbox highlights.")+'</div>';
 }catch(error){summary.textContent="Briefing unavailable: "+error.message}
}
$("briefing-refresh")?.addEventListener("click",loadBriefing);

async function loadConfiguration(){
 const summary=$("configuration-summary"),root=$("configuration-groups");if(!summary||!root)return;
 summary.textContent="Scanning server environment readiness…";
 try{
  const {configuration}=await api("/api/system/configuration");
  summary.textContent=configuration.configured+" of "+configuration.total+" configuration items ready · "+configuration.groups.length+" integration groups";
  root.innerHTML=configuration.groups.map(group=>'<section class="configuration-group"><div class="configuration-group-head"><b>'+escapeHtml(group.label)+'</b><span>'+group.configured+'/'+group.total+' READY</span></div>'+group.items.map(item=>'<article class="configuration-item"><div><b>'+escapeHtml(item.label)+'</b><small>'+escapeHtml(item.key)+' · '+escapeHtml(item.purpose)+'</small></div><span class="configuration-state '+(item.configured?'ready':'missing')+'">'+(item.configured?'CONFIGURED':'NOT SET')+'</span></article>').join("")+'</section>').join("");
 }catch(error){summary.textContent="Configuration scan unavailable: "+error.message;root.innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
}
$("configuration-refresh")?.addEventListener("click",loadConfiguration);

async function loadGoogleIntegrations(){
 const root=$("google-integrations");if(!root)return;
 try{
  const data=await api("/api/integrations/google/status");
  const connected=Object.fromEntries((data.connections||[]).map(x=>[x.service,x]));
  root.innerHTML=["gmail","calendar"].map(service=>{
   const item=connected[service],label=service==="gmail"?"Gmail":"Google Calendar";
   const detail=item?"Connected as "+(item.email||"Google account")+" · "+prettyTime(item.connected_at):data.configured?"Not connected yet":"Server setup required";
   const action=item?'<button class="integration-button" data-google-read="'+service+'">VIEW RECENT</button><button class="integration-button danger" data-google-disconnect="'+service+'">DISCONNECT</button>':data.configured&&data.storageReady?'<a class="integration-button" href="/api/integrations/google/'+service+'/connect">CONNECT GOOGLE</a>':'<span class="integration-state warn">SETUP REQUIRED</span>';
   return '<article class="integration-card"><div class="integration-icon">'+(service==="gmail"?"✉":"▦")+'</div><div class="integration-info"><b>'+label+'</b><small>'+detail+'</small><em>READ-ONLY PERMISSION · NO SEND / EDIT ACCESS</em></div>'+action+'</article>';
  }).join("");
  if(!data.storageReady)root.insertAdjacentHTML("beforeend",'<div class="empty-state">PostgreSQL is required for secure OAuth state and token storage.</div>');
  if(!data.configured)root.insertAdjacentHTML("beforeend",'<div class="integration-help">Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and ULTRON_TOKEN_ENCRYPTION_KEY in Render. See <a href="https://github.com/gamingwithmahi/ultron-ai/blob/main/docs/GOOGLE_OAUTH.md" target="_blank" rel="noopener">Google setup guide ↗</a>.</div>');
 }catch(error){root.innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
}
$("google-integrations")?.addEventListener("click",async event=>{
 const button=event.target.closest("[data-google-disconnect]");if(!button)return;
 if(!confirm("Disconnect "+button.dataset.googleDisconnect+" from ULTRON?"))return;
 button.disabled=true;
 try{await api("/api/integrations/google/"+button.dataset.googleDisconnect+"/disconnect",{method:"POST"});await loadGoogleIntegrations();await loadDiagnostics();toast("GOOGLE ACCOUNT DISCONNECTED")}catch(error){toast(error.message);button.disabled=false}
});

$("google-integrations")?.addEventListener("click",async event=>{
 const button=event.target.closest("[data-google-read]");if(!button)return;
 const service=button.dataset.googleRead;button.disabled=true;button.textContent="LOADING…";
 try{
  const data=await api(service==="gmail"?"/api/integrations/google/gmail/messages":"/api/integrations/google/calendar/events");
  const preview=$("google-data-preview");
  if(service==="gmail"){
   preview.innerHTML='<h3>RECENT GMAIL MESSAGES</h3>'+(data.messages.length?data.messages.map(item=>'<article class="google-data-row"><b>'+escapeHtml(item.subject||"(No subject)")+'</b><small>'+escapeHtml(item.from)+' · '+escapeHtml(item.date)+'</small><p>'+escapeHtml(item.snippet)+'</p>'+(item.unread?'<em>UNREAD</em>':'')+'</article>').join(""):'<div class="empty-state">No recent messages found.</div>');
  }else{
   preview.innerHTML='<h3>UPCOMING CALENDAR EVENTS</h3>'+(data.events.length?data.events.map(item=>'<article class="google-data-row"><b>'+escapeHtml(item.summary)+'</b><small>'+escapeHtml(item.start?prettyTime(item.start):"Time not set")+'</small>'+(item.location?'<p>'+escapeHtml(item.location)+'</p>':'')+'</article>').join(""):'<div class="empty-state">No upcoming events found.</div>');
  }
 }catch(error){$("google-data-preview").innerHTML='<div class="empty-state">'+escapeHtml(error.message)+'</div>'}
 finally{button.disabled=false;button.textContent="VIEW RECENT"}
});

const googleResult=new URLSearchParams(location.search).get("google");
if(googleResult){history.replaceState({},document.title,location.pathname+location.hash);toast(googleResult==="connected"?"GOOGLE ACCOUNT CONNECTED":googleResult==="denied"?"GOOGLE ACCESS CANCELLED":"GOOGLE CONNECTION NEEDS ATTENTION");}

initializeAuth();
