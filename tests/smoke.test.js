const test = require("node:test");
const assert = require("node:assert/strict");

test("ULTRON project metadata is valid", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "ultron-ai");
  assert.equal(pkg.version, "2.2.0");
  assert.ok(pkg.scripts.start);
  assert.ok(pkg.scripts.check);
});

test("server exposes secure setup and approval routes in source", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../server.js"), "utf8");
  for (const route of ["/api/auth/setup", "/api/auth/login", "/api/auth/logout", "/api/approvals", "/api/audit", "/api/assistant/chat", "/api/assistant/status", "/api/tasks", "/api/memory", "/api/system/diagnostics", "/api/export"]) {
    assert.ok(source.includes(route), "missing route " + route);
  }
  assert.ok(source.includes("timingSafeEqual"));
  assert.ok(source.includes("scrypt"));
  assert.ok(source.includes("checkCsrf"));
});
test("private overview requires authentication and backup omits administrator credentials", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../server.js"), "utf8");
  assert.ok(source.includes('app.get("/api/overview",auth'));
  assert.ok(source.includes('app.get("/api/export",auth'));
  assert.ok(source.includes('data:{approvals:store.approvals,audit:store.audit,tasks:store.tasks,memories:store.memories,notifications:store.notifications}'));
  assert.ok(!source.includes('data:{admin:store.admin'));
});

test("operations dashboard exposes diagnostics and audit controls", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  const client = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  for (const id of ["system-diagnostics", "diagnostics-list", "diagnostics-refresh", "audit-log", "audit-list", "audit-refresh"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing dashboard element " + id);
  }
  assert.ok(client.includes('api("/api/system/diagnostics")'));
  assert.ok(client.includes('api("/api/audit?limit=30")'));
  assert.ok(client.includes('loadDiagnostics();loadAudit()'));
});

test("production sessions are stored as SHA-256 hashes in PostgreSQL", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../server.js"), "utf8");
  const migrations = fs.readFileSync(require.resolve("../lib/db-migrations.js"), "utf8");
  assert.ok(migrations.includes("CREATE TABLE IF NOT EXISTS ultron_sessions"));
  assert.ok(migrations.includes("CREATE INDEX IF NOT EXISTS ultron_sessions_expires_idx"));
  assert.ok(source.includes('crypto.createHash("sha256").update(id).digest("hex")'));
  assert.ok(source.includes("async function session(req)"));
  assert.ok(source.includes('DELETE FROM ultron_sessions WHERE session_hash=$1'));
  assert.ok(source.includes("await newSession(r)"));
  assert.ok(source.includes('label:"Login sessions"'));
  assert.ok(source.includes("ULTRON v2.2 running on"));
});

test("database migrations define normalized operational projections and transactional sync", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../lib/db-migrations.js"), "utf8");
  for (const name of ["ultron_schema_migrations", "ultron_state", "ultron_sessions", "ultron_approvals", "ultron_tasks", "ultron_memories", "ultron_audit"]) assert.ok(source.includes(name), "missing schema object " + name);
  assert.ok(source.includes("pg_advisory_xact_lock"));
  assert.ok(source.includes("async function syncProjection"));
  assert.ok(source.includes("ON CONFLICT"));
});

test("durable job queue has locked claims, bounded retries, and an allowlisted worker", () => {
  const fs = require("node:fs");
  const migration = fs.readFileSync(require.resolve("../lib/db-migrations.js"), "utf8");
  const google = fs.readFileSync(require.resolve("../lib/google-oauth.js"), "utf8");
  const worker = fs.readFileSync(require.resolve("../lib/job-worker.js"), "utf8");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  for (const marker of ["ultron_jobs", "durable_background_job_queue", "ultron_jobs_claim_idx", "ultron_jobs_lease_idx"]) assert.ok(migration.includes(marker));
  for (const marker of ["FOR UPDATE SKIP LOCKED", "maintenance.session_cleanup", "maintenance.database_health", "max_attempts", "locked_by", "async stop()"]) assert.ok(worker.includes(marker));
  assert.ok(server.includes('app.get("/api/jobs",auth'));
  assert.ok(server.includes('app.post("/api/jobs",auth,checkCsrf'));
  assert.ok(server.includes("createJobWorker"));
  assert.ok(server.includes('status:pool?"active":"postgres_required"'));
});
test("background worker contains no external-action integrations", () => {
  const fs = require("node:fs");
  const worker = fs.readFileSync(require.resolve("../lib/job-worker.js"), "utf8");
  for (const marker of ["gmail", "whatsapp", "publish_content", "financial_action", "fetch("]) assert.ok(!worker.toLowerCase().includes(marker));
});

test("Google integration routes are authenticated, CSRF protected, and read-only", () => {
  const fs = require("node:fs");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  const migration = fs.readFileSync(require.resolve("../lib/db-migrations.js"), "utf8");
  const google = fs.readFileSync(require.resolve("../lib/google-oauth.js"), "utf8");
  for (const route of ["/api/integrations/google/status", "/api/integrations/google/:service/connect", "/api/integrations/google/callback", "/api/integrations/google/:service/disconnect", "/api/integrations/google/gmail/messages", "/api/integrations/google/calendar/events"]) assert.ok(server.includes(route));
  assert.ok(server.includes('app.post("/api/integrations/google/:service/disconnect",auth,checkCsrf'));
  assert.ok(server.includes("ultron_google_oauth_states"));
  assert.ok(server.includes("ultron_google_connections"));
  assert.ok(google.includes("gmail.readonly"));
  assert.ok(google.includes("calendar.readonly"));
  assert.ok(migration.includes("version: 3"));
});
test("dashboard includes separate Google integration controls", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  const client = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  assert.ok(html.includes('id="google-integrations"'));
  assert.ok(client.includes('api("/api/integrations/google/status")'));
  assert.ok(client.includes("data-google-disconnect"));
});

test("Daily briefing endpoint aggregates Google read-only data and operator queues", () => {
  const fs = require("node:fs");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  const client = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  assert.ok(server.includes('app.get("/api/briefing",auth,googleOAuthLimiter'));
  assert.ok(server.includes('collectBriefingService("gmail")'));
  assert.ok(server.includes('collectBriefingService("calendar")'));
  assert.ok(client.includes('api("/api/briefing")'));
  assert.ok(html.includes('id="briefing-refresh"'));
  assert.ok(html.includes('id="briefing-calendar"'));
  assert.ok(html.includes('id="briefing-gmail"'));
});

test("v1.2 agent registry exposes explicit capability, permission, and execution states", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8"),agents=require("../lib/agent-orchestrator");
 assert.ok(server.includes('app.get("/api/agents",auth'));
 for(const id of ["gmail","calendar","youtube","whatsapp","financial","trading","meeting","phone","security","memory","personal","research"])assert.ok(agents.DEFINITIONS.some(agent=>agent.id===id));
 assert.ok(html.includes('id="agent-registry"'));assert.ok(client.includes('api("/api/agents")'));
});
test("v1.2 notifications are persisted, protected, and included in backups", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 for(const route of ['app.get("/api/notifications",auth','app.patch("/api/notifications/:id",auth,checkCsrf','app.delete("/api/notifications/:id",auth,checkCsrf','app.post("/api/notifications/read-all",auth,checkCsrf'])assert.ok(server.includes(route));
 assert.ok(server.includes("notifications:store.notifications"));assert.ok(server.includes("function notify(type,title,message)"));assert.ok(html.includes('id="notification-list"'));assert.ok(client.includes('api("/api/notifications")'));assert.ok(client.includes("notifications/read-all"));
});
test("v1.2 Google provider helper has a bounded timeout and normalized errors", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8");assert.ok(server.includes("AbortSignal.timeout(10000)"));assert.ok(server.includes("Google service temporarily unavailable"));
});

test("v1.3 intelligence workspace is authenticated, read-only, and wired to the dashboard", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 assert.ok(server.includes('app.get("/api/intelligence/workspace",auth,googleOAuthLimiter'));
 assert.ok(server.includes("buildIntelligenceSnapshot"));
 assert.ok(html.includes('id="intelligence-workspace"'));
 assert.ok(client.includes('api("/api/intelligence/workspace")'));
 assert.ok(client.includes("loadIntelligence()"));
});
test("v1.3 direct Gmail and Calendar API requests have bounded timeouts", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8");
 assert.ok(server.includes('maxResults=10",{headers,signal:AbortSignal.timeout(10000)}'));
 assert.ok(server.includes('metadataHeaders=Date",{headers,signal:AbortSignal.timeout(10000)}'));
 assert.ok(server.includes('signal:AbortSignal.timeout(10000)});'));
});

test("v1.4 configuration inventory is server-side, secret-safe, and dashboard wired", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8"),catalog=require("../lib/configuration");
 assert.ok(server.includes('app.get("/api/system/configuration",auth'));
 assert.ok(html.includes('id="configuration-vault"'));
 assert.ok(client.includes('api("/api/system/configuration")'));
 const report=catalog.buildConfigurationReport({ULTRON_SETUP_KEY:"private-setup",ULTRON_SESSION_SECRET:"x".repeat(40),OPENAI_API_KEY:"sk-test"});
 const serialized=JSON.stringify(report);
 assert.ok(!serialized.includes("sk-test"));
 assert.ok(!serialized.includes("private-setup"));
 assert.ok(report.groups.some(group=>group.items.some(item=>item.key==="OPENAI_API_KEY"&&item.configured)));
 assert.ok(report.groups.some(group=>group.items.some(item=>item.key==="WHATSAPP_ACCESS_TOKEN"&&!item.configured)));
});

test("v1.5 approval governance enforces validation, expiry, queue limits and no execution",()=>{
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),policy=require("../lib/approval-policy");
 const valid=policy.validateApprovalRequest({title:"Send invoice",details:"Only after operator review",actionType:"send_message",risk:"high"});
 assert.equal(valid.ok,true);
 assert.equal(policy.validateApprovalRequest({title:"x",details:"",actionType:"financial_action",risk:"critical"}).ok,false);
 assert.ok(server.includes('app.get("/api/security/center",auth'));
 assert.ok(server.includes("approvalPolicy.expirePendingApprovals"));
 const old={status:"pending",createdAt:new Date(Date.now()-8*86400000).toISOString()};
 assert.equal(policy.isExpired(old),true);
 const items=[old,{status:"pending",createdAt:new Date().toISOString()}];
 assert.equal(policy.expirePendingApprovals(items).length,1);
 assert.equal(items[0].status,"expired");
 assert.equal(policy.DEFAULT_TTL_MS,7*24*60*60*1000);
});

test("v1.6 central brain exposes all twelve declared agents with explicit capability gates", () => {
  const orchestrator = require("../lib/agent-orchestrator");
  const registry = orchestrator.buildAgentRegistry({ connectedServices: ["gmail"], openAiConfigured: true });
  assert.equal(registry.version, "1.6.0");
  assert.equal(registry.agents.length, 12);
  assert.equal(registry.summary.total, 12);
  assert.equal(registry.agents.find(agent => agent.id === "gmail").status, "connected");
  assert.equal(registry.agents.find(agent => agent.id === "calendar").status, "connect_required");
  assert.equal(registry.agents.find(agent => agent.id === "trading").status, "simulation_only");
  assert.equal(registry.safety.externalWritesEnabled, false);
  assert.equal(registry.safety.realMoneyTradingEnabled, false);
  assert.equal(orchestrator.getAgent("unknown"), null);
});
test("v1.6 agent routes are authenticated and expose individual capability manifests", () => {
  const fs = require("node:fs");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  assert.ok(server.includes('app.get("/api/agents",auth'));
  assert.ok(server.includes('app.get("/api/agents/:id",auth'));
  assert.ok(server.includes('agentOrchestrator.buildAgentRegistry'));
});
test("v1.6 memory search ranks matching terms and validates filters safely", () => {
  const { searchMemories } = require("../lib/memory-search");
  const memories = [
    { id:"1", category:"project", content:"ULTRON central brain architecture", createdAt:"2026-11-01T10:00:00.000Z" },
    { id:"2", category:"fact", content:"YouTube channel analytics", createdAt:"2026-11-02T10:00:00.000Z" },
    { id:"3", category:"project", content:"ULTRON agent registry and orchestration", createdAt:"2026-11-03T10:00:00.000Z" }
  ];
  const result = searchMemories(memories, { query:"ULTRON agent", category:"project", limit:1 });
  assert.equal(result.total, 2);
  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0].id, "3");
  assert.equal(result.hasMore, true);
  assert.equal(searchMemories(memories, { category:"secret" }).error, "Invalid memory category");
  assert.equal(searchMemories(memories, { from:"not-a-date" }).error, "Invalid start date");
});
test("v1.6 memory search API and dashboard controls are wired", () => {
  const fs = require("node:fs");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  const client = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  assert.ok(server.includes('app.get("/api/memory/search",auth'));
  assert.ok(html.includes('id="memory-search-form"'));
  assert.ok(html.includes('id="memory-filter"'));
  assert.ok(client.includes('api("/api/memory/search?"'));
});

test("v1.7 knowledge records validate metadata, tags, and reject credential-like content", () => {
 const records=require("../lib/memory-records");
 const valid=records.validateMemoryInput({content:"Project launch notes",category:"project",title:"Launch",source:"meeting",context:"Planning call",tags:"ULTRON, launch, ULTRON",importance:"high",pinned:true});
 assert.equal(valid.value.title,"Launch");assert.deepEqual(valid.value.tags,["ultron","launch"]);assert.equal(valid.value.pinned,true);
 assert.match(records.validateMemoryInput({content:"api_key: abc123",category:"fact"}).error,/Do not save/);
 assert.equal(records.validateMemoryInput({content:"okay",category:"secret"}).error,"Invalid memory category");
 assert.equal(records.validateMemoryInput({content:"okay",category:"fact",importance:"urgent"}).error,"Invalid memory importance");
});
test("v1.7 knowledge stats summarize pinned and important records", () => {
 const {buildMemoryStats}=require("../lib/memory-records");
 const stats=buildMemoryStats([{category:"project",pinned:true,importance:"critical",createdAt:"2026-11-01T00:00:00Z"},{category:"fact",pinned:false,importance:"normal",createdAt:"2026-11-02T00:00:00Z"}]);
 assert.equal(stats.total,2);assert.equal(stats.pinned,1);assert.equal(stats.highImportance,1);assert.equal(stats.byCategory.project,1);
});
test("v1.7 memory search includes title, context, tags, pin filter and priority", () => {
 const {searchMemories}=require("../lib/memory-search");
 const memories=[{id:"1",category:"fact",content:"old item",title:"Meeting note",tags:["calendar"],pinned:false,createdAt:"2026-11-01T00:00:00Z"},{id:"2",category:"project",content:"launch plan",title:"ULTRON roadmap",context:"meeting follow up",tags:["central-brain"],pinned:true,importance:"high",createdAt:"2026-11-02T00:00:00Z"}];
 const result=searchMemories(memories,{query:"central brain",pinned:true});
 assert.equal(result.total,1);assert.equal(result.memories[0].id,"2");
 assert.equal(searchMemories(memories,{pinned:"false"}).total,1);
});
test("v1.7 database migration adds indexed knowledge metadata and sync projection", () => {
 const migration=require("../lib/db-migrations");
 const v4=migration.MIGRATIONS.find(item=>item.version===4);
 assert.ok(v4);assert.ok(v4.statements.some(sql=>sql.includes("ADD COLUMN IF NOT EXISTS tags")));
 assert.ok(v4.statements.some(sql=>sql.includes("ultron_memories_pinned_updated_idx")));
 assert.ok(migration.syncProjection.toString().includes("source_ref"));
});
test("v1.7 knowledge API is authenticated, CSRF protected for writes, and exposes update/stats", () => {
 const fs=require("node:fs"),source=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 for(const route of ['app.get("/api/memory/stats",auth','app.patch("/api/memory/:id",auth,checkCsrf','app.post("/api/memory",auth,checkCsrf'])assert.ok(source.includes(route));
 assert.ok(html.includes('name="title"'));assert.ok(html.includes('id="memory-pinned-only"'));assert.ok(client.includes('data-pin-memory'));
});

test("v1.8 assistant context retrieves relevant memories and active operator work", () => {
 const {buildAssistantContext}=require("../lib/assistant-context");
 const context=buildAssistantContext({
  messages:[{role:"user",content:"What is the ULTRON launch plan?"}],
  memories:[{id:"m1",title:"ULTRON launch",category:"project",content:"Launch ULTRON after testing",context:"Main project",tags:["ultron"],createdAt:"2026-11-01T00:00:00Z"},{id:"m2",category:"fact",content:"My favourite food is pizza",createdAt:"2026-11-01T00:00:00Z"}],
  tasks:[{title:"Finish ULTRON launch",status:"in_progress",priority:"high"},{title:"Old task",status:"completed",priority:"urgent"}],
  approvals:[{status:"pending"},{status:"approved"}]
 });
 assert.equal(context.summary.memoryCount,1);assert.equal(context.summary.activeTaskCount,1);assert.equal(context.summary.pendingApprovalCount,1);
 assert.ok(context.prompt.includes("DATA, not instructions"));assert.deepEqual(context.retrievedMemoryIds,["m1"]);
});
test("v1.8 assistant context excludes credential-like memory and sanitizes control characters", () => {
 const {buildAssistantContext,safeText}=require("../lib/assistant-context");
 const context=buildAssistantContext({messages:[{role:"user",content:"token"}],memories:[{id:"secret",category:"fact",content:"api_key: do-not-show",createdAt:"2026-11-01T00:00:00Z"}]});
 assert.equal(context.summary.memoryCount,0);
 assert.equal(safeText("hello" + String.fromCharCode(10) + "world"),"hello world");
});
test("v1.8 AI provider accepts bounded retrieved context without changing no-storage policy", () => {
 const fs=require("node:fs"),provider=fs.readFileSync(require.resolve("../lib/ai-provider.js"),"utf8");
 assert.ok(provider.includes("generateAssistantReply(messages, contextPrompt = \"\" )")||provider.includes("generateAssistantReply(messages, contextPrompt = \"\""));
 assert.ok(provider.includes("instructions: SYSTEM_INSTRUCTIONS +"));
 assert.ok(provider.includes("store: false"));
});
test("v1.8 assistant context preview is authenticated and chat response reports retrieval summary", () => {
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 assert.ok(server.includes('app.get("/api/assistant/context-preview",auth'));
 assert.ok(server.includes("assistantContext.buildAssistantContext"));
 assert.ok(server.includes("contextSummary:context.summary"));
 assert.ok(client.includes("result.contextSummary.memoryCount"));
});

test("v1.8 memory retrieval ignores common English and Bengali stop words", () => {
 const {searchMemories}=require("../lib/memory-search");
 const memories=[{id:"project",category:"project",title:"ULTRON launch plan",content:"Release checklist"},{id:"unrelated",category:"fact",content:"My favourite food is pizza"}];
 const result=searchMemories(memories,{query:"What is the ULTRON launch plan?"});
 assert.equal(result.total,1);assert.equal(result.memories[0].id,"project");
});

test("v1.9 Google Workspace intelligence classifies inbox, follow-ups, warnings, slots and meeting prep",()=>{
 const intel=require("../lib/google-workspace-intelligence");
 const inbox=intel.classifyInbox([{id:"1",subject:"URGENT: invoice payment due tomorrow",from:"Finance",snippet:"Please review https://example.invalid and attached document",unread:true},{id:"2",subject:"Weekly newsletter"}]);
 assert.equal(inbox.summary.total,2);assert.equal(inbox.summary.critical,1);assert.equal(inbox.summary.followUps,1);assert.equal(inbox.summary.linkWarnings,1);
 assert.equal(inbox.items[0].reviewWarning.includes("not opened"),true);
 const slots=intel.findFocusSlots([],{now:new Date("2026-11-30T00:00:00Z"),durationMinutes:60,days:5,maxSlots:3});
 assert.equal(slots.length,3);assert.equal(slots[0].timezone,"Asia/Dhaka");
 const prep=intel.meetingPrep({events:[{id:"e",summary:"ULTRON launch review",start:"2026-12-01T10:00:00+06:00",end:"2026-12-01T11:00:00+06:00"}],emails:[{subject:"ULTRON launch review agenda"}],memories:[{title:"ULTRON launch",content:"Release plan"}],tasks:[{title:"Prepare ULTRON launch",status:"in_progress"}],now:new Date("2026-11-30T00:00:00Z")});
 assert.equal(prep.length,1);assert.equal(prep[0].relatedEmails.length,1);assert.equal(prep[0].relatedMemories.length,1);assert.equal(prep[0].relatedTasks.length,1);
 const allDay=intel.findFocusSlots([{start:"2026-12-01",end:"2026-12-02"}],{now:new Date("2026-12-01T00:00:00Z"),durationMinutes:60,days:3,maxSlots:8});
 assert.ok(allDay.every(slot=>!slot.localLabel.startsWith("2026-12-01")),"all-day events must block the full local day");
 const draft=intel.prepareReplyDraft({subject:"Question",from:"Alex"});
 assert.equal(draft.sendEnabled,false);assert.equal(draft.status,"draft_suggestion_only");
});
test("v1.9 planner API is authenticated, bounded and remains read-only",()=>{
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 assert.ok(server.includes('app.get("/api/workspace/command-plan",auth'));
 assert.ok(server.includes("workspaceIntel.findFocusSlots"));
 assert.ok(server.includes("emailSending:false"));
 assert.ok(html.includes("workspace-command-plan"));
 assert.ok(client.includes("/api/workspace/command-plan"));
 assert.ok(client.includes("DRAFT SUGGESTION ONLY"));
});

test("v2.0 reminder engine validates and summarizes recurring reminders",()=>{const e=require("../lib/workflow-engine"),now=new Date("2026-11-28T00:00:00Z");assert.ok(e.createReminder({title:"x",dueAt:"bad"},now).error);const x=e.createReminder({title:"Review roadmap",dueAt:"2026-11-28T01:00:00Z",recurrence:"daily"},now).value;assert.equal(x.timezone,"Asia/Dhaka");assert.equal(e.summarizeReminders([x],now).summary.dueSoon,1);assert.equal(e.buildOperationsSnapshot({reminders:[x],now}).externalActionsEnabled,false)});
test("v2.0 workflows enforce fixed templates and ordered checklist completion",()=>{const e=require("../lib/workflow-engine"),now=new Date("2026-11-28T00:00:00Z");assert.ok(e.createWorkflow({template:"arbitrary"},now).error);let w=e.createWorkflow({template:"daily_briefing"},now).value;assert.equal(w.executionMode,"operator_checklist");assert.equal(w.externalActionsEnabled,false);assert.ok(e.updateWorkflowStep(w,"2","completed",now).error);for(const x of w.steps)assert.ok(e.updateWorkflowStep(w,x.id,"completed",now).value);assert.equal(w.status,"completed");assert.equal(w.currentStep,w.steps.length);assert.ok(e.setWorkflowStatus(w,"active",now).error)});
test("v2.0 authenticated workflow and reminder APIs are present",()=>{const fs=require("node:fs"),s=fs.readFileSync(require.resolve("../server.js"),"utf8"),h=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),a=fs.readFileSync(require.resolve("../public/app.js"),"utf8");for(const x of ['/api/operations/snapshot','/api/reminders','/api/workflows'])assert.ok(s.includes(x));assert.ok(s.includes('app.patch("/api/workflows/:id/steps/:stepId",auth'));assert.ok(s.includes("workflowEngine.createWorkflow"));assert.ok(s.includes("workflowEngine.createReminder"));assert.ok(h.includes('id="workflow-center"'));assert.ok(h.includes('id="reminder-form"'));assert.ok(a.includes("data-reminder-snooze"));assert.ok(a.includes("data-workflow-step"))});

test("v2.1 task intelligence validates metadata and computes urgency ranking",()=>{const e=require("../lib/task-intelligence"),now=new Date("2026-11-28T00:00:00Z");const t=e.createTask({title:"Finish launch",priority:"high",category:"project",dueAt:"2026-11-28T01:00:00Z",estimateMinutes:45},[],now).value;assert.equal(t.category,"project");assert.equal(e.scoreTask(t,[t],now).dueSoon,true);assert.ok(e.scoreTask(t,[t],now).score>70);assert.ok(e.createTask({title:"Bad",priority:"urgent"},[],now).error);assert.ok(e.createTask({title:"Bad estimate",estimateMinutes:2},[],now).error)});
test("v2.1 dependency graph blocks completion until prerequisites are done",()=>{const e=require("../lib/task-intelligence"),now=new Date("2026-11-28T00:00:00Z");const a=e.createTask({title:"Prepare data"},[],now).value;const b=e.createTask({title:"Publish report",dependsOn:[a.id]},[a],now).value;assert.equal(e.dependencyState(b,[a,b]).blocked,true);assert.ok(e.validateTaskUpdate(b,{status:"completed"},[a,b],now).error);const done={...a,status:"completed"};assert.equal(e.dependencyState(b,[done,b]).blocked,false);assert.equal(e.validateTaskUpdate(b,{status:"completed"},[done,b],now).value.status,"completed")});
test("v2.1 task ranking exposes overdue, due soon, blocked and category summary",()=>{const e=require("../lib/task-intelligence"),now=new Date("2026-11-28T00:00:00Z");const a=e.createTask({title:"Late item",dueAt:"2026-11-27T00:00:00Z",priority:"low"},[],now).value;const b=e.createTask({title:"Due today",dueAt:"2026-11-28T04:00:00Z"},[],now).value;const x=e.summarizeTasks([a,b],now);assert.equal(x.summary.overdue,1);assert.equal(x.summary.dueSoon,1);assert.equal(x.summary.active,2);assert.ok(x.tasks[0].score>=x.tasks[1].score)});
test("v2.1 task update validation rejects bad priorities, dates, cycles and finalized edits",()=>{const e=require("../lib/task-intelligence"),now=new Date("2026-11-28T00:00:00Z");const a=e.createTask({title:"Alpha"},[],now).value;assert.ok(e.validateTaskUpdate(a,{priority:"urgent"},[a],now).error);assert.ok(e.validateTaskUpdate(a,{dueAt:"not-date"},[a],now).error);assert.ok(e.validateTaskUpdate(a,{dependsOn:[a.id]},[a],now).error);assert.ok(e.validateTaskUpdate({...a,status:"completed"},{priority:"high"},[a],now).error)});
test("v2.1 notification intelligence ranks unread security events and summarizes severity",()=>{const e=require("../lib/notification-intelligence");const data=e.summarizeNotifications([{id:"a",type:"task",title:"Task added",createdAt:"2026-11-28T00:00:00Z"},{id:"b",type:"security",title:"Suspicious login attempt",createdAt:"2026-11-27T00:00:00Z"},{id:"c",type:"reminder",title:"Reminder overdue",createdAt:"2026-11-28T01:00:00Z",readAt:"2026-11-28T02:00:00Z"}]);assert.equal(data.summary.unread,2);assert.equal(data.summary.critical,1);assert.equal(data.notifications[0].id,"b")});
test("v2.1 authenticated task insights and notification summaries are wired into dashboard",()=>{const fs=require("node:fs"),s=fs.readFileSync(require.resolve("../server.js"),"utf8"),h=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),a=fs.readFileSync(require.resolve("../public/app.js"),"utf8");assert.ok(s.includes('app.get("/api/tasks/insights",auth'));assert.ok(s.includes("taskIntel.validateTaskUpdate"));assert.ok(s.includes("notificationIntel.summarizeNotifications"));assert.ok(h.includes('id="task-summary"'));assert.ok(h.includes('name="dueAt"'));assert.ok(a.includes("data.summary?.critical"))});

test("v2.1 task dependency updates reject transitive cycles and preserve completed history",()=>{const e=require("../lib/task-intelligence"),now=new Date("2026-11-28T00:00:00Z");const a=e.createTask({title:"First"},[],now).value,b=e.createTask({title:"Second",dependsOn:[a.id]},[a],now).value;assert.ok(e.validateTaskUpdate(a,{dependsOn:[b.id]},[a,b],now).error);const done={...a,status:"completed",updatedAt:now.toISOString()};const summary=e.summarizeTasks([done,b],now);assert.equal(summary.tasks.length,2);assert.equal(summary.tasks[1].status,"completed")});

test("v2.2 focus sessions validate duration and optional active task link",()=>{const f=require("../lib/focus-sessions"),task={id:"t1",status:"queued"};assert.equal(f.createSession({title:"Deep work",targetMinutes:45,taskId:"t1"},[task]).value.targetMinutes,45);assert.ok(f.createSession({title:"Bad duration",targetMinutes:2},[]).error);assert.ok(f.createSession({title:"Bad task",taskId:"missing"},[task]).error)});
test("v2.2 focus lifecycle accumulates time across pause and resume",()=>{const f=require("../lib/focus-sessions"),t0=new Date("2026-11-28T00:00:00Z"),t1=new Date("2026-11-28T00:10:00Z"),t2=new Date("2026-11-28T00:20:00Z"),t3=new Date("2026-11-28T00:30:00Z");let s=f.createSession({title:"Build module",targetMinutes:25},[],t0).value;s=f.transitionSession(s,"pause",t1).value;assert.equal(s.elapsedSeconds,600);s=f.transitionSession(s,"resume",t2).value;s=f.transitionSession(s,"complete",t3).value;assert.equal(s.elapsedSeconds,1200);assert.equal(s.status,"completed");assert.equal(s.segments.length,2)});
test("v2.2 focus session state rejects invalid transitions and exposes progress",()=>{const f=require("../lib/focus-sessions"),t0=new Date("2026-11-28T00:00:00Z"),t1=new Date("2026-11-28T00:12:30Z");let s=f.createSession({title:"Study",targetMinutes:25},[],t0).value;assert.ok(f.transitionSession(s,"resume",t1).error);const view=f.presentSession(s,t1);assert.equal(view.elapsedSeconds,750);assert.equal(view.progressPercent,50);s=f.transitionSession(s,"cancel",t1).value;assert.ok(f.transitionSession(s,"resume",t1).error)});
test("v2.2 focus analytics summarize daily and completed session totals",()=>{const f=require("../lib/focus-sessions"),now=new Date("2026-11-28T12:00:00Z");const a=f.createSession({title:"Session A",targetMinutes:25},[],new Date("2026-11-28T08:00:00Z")).value;a.status="completed";a.elapsedSeconds=1500;a.completedAt="2026-11-28T08:25:00Z";const x=f.summarizeSessions([a],now);assert.equal(x.summary.todaySessions,1);assert.equal(x.summary.todayMinutes,25);assert.equal(x.summary.completed,1);assert.equal(x.daily[0].minutes,25)});
test("v2.2 focus API and dashboard controls are integrated with persistent state",()=>{const fs=require("node:fs"),s=fs.readFileSync(require.resolve("../server.js"),"utf8"),h=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),a=fs.readFileSync(require.resolve("../public/app.js"),"utf8");assert.ok(s.includes('app.get("/api/focus",auth'));assert.ok(s.includes('app.patch("/api/focus/:id",auth'));assert.ok(s.includes("store.focusSessions"));assert.ok(h.includes('id="focus-form"'));assert.ok(a.includes('api("/api/focus"'))});

test("v2.2 server starts with focus session storage and prevents concurrent resume",()=>{const fs=require("node:fs"),s=fs.readFileSync(require.resolve("../server.js"),"utf8");assert.ok(s.includes("notifications:[],focusSessions:[],reminders:[]"));assert.ok(s.includes('q.body&&q.body.action==="resume"&&store.focusSessions.some'))});
