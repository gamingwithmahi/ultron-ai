const test = require("node:test");
const assert = require("node:assert/strict");

test("ULTRON project metadata is valid", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "ultron-ai");
  assert.equal(pkg.version, "0.8.0");
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
  assert.ok(source.includes("ULTRON v0.8 running on"));
});

test("database migrations define normalized operational projections and transactional sync", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../lib/db-migrations.js"), "utf8");
  for (const name of ["ultron_schema_migrations", "ultron_state", "ultron_sessions", "ultron_approvals", "ultron_tasks", "ultron_memories", "ultron_audit"]) assert.ok(source.includes(name), "missing schema object " + name);
  assert.ok(source.includes("pg_advisory_xact_lock"));
  assert.ok(source.includes("async function syncProjection"));
  assert.ok(source.includes("ON CONFLICT"));
});
