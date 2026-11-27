const test = require("node:test");
const assert = require("node:assert/strict");

test("ULTRON project metadata is valid", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.name, "ultron-ai");
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
