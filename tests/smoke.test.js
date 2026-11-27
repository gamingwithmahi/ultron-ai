const test = require("node:test");
const assert = require("node:assert/strict");

test("ULTRON project metadata is valid", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "ultron-ai");
  assert.equal(pkg.version, "1.1.0");
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
  assert.ok(source.includes('data:{approvals:store.approvals,audit:store.audit,tasks:store.tasks,memories:store.memories}'));
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
  assert.ok(source.includes("ULTRON v1.1 running on"));
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
