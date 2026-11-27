const test = require("node:test");
const assert = require("node:assert/strict");

test("ULTRON project metadata is valid", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "ultron-ai");
  assert.equal(pkg.version, "1.6.0");
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
  assert.ok(source.includes("ULTRON v1.6 running on"));
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
 const fs=require("node:fs"),server=fs.readFileSync(require.resolve("../server.js"),"utf8"),html=fs.readFileSync(require.resolve("../public/index.html"),"utf8"),client=fs.readFileSync(require.resolve("../public/app.js"),"utf8");
 assert.ok(server.includes('app.get("/api/agents",auth'));for(const marker of ['id:"gmail"','id:"calendar"','id:"youtube"','id:"whatsapp"','simulation_only','official_api_required','canRun'])assert.ok(server.includes(marker));
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
