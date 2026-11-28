"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bootstrapInitialAdmin = require("../lib/admin-bootstrap");

function fixture(env = {}) {
  const calls = { persisted: 0, audits: [] };
  const store = { admin: null };
  return {
    calls,
    store,
    env,
    run: () => bootstrapInitialAdmin({
      store,
      env,
      hashPassword: async password => ({ hash: "hashed:" + password }),
      persist: async () => { calls.persisted += 1; },
      audit: (...args) => calls.audits.push(args)
    })
  };
}

test("bootstrap creates one administrator and persists only the password hash", async () => {
  const f = fixture({
    ULTRON_BOOTSTRAP_ADMIN_USERNAME: "ultron-admin",
    ULTRON_BOOTSTRAP_ADMIN_PASSWORD: "A".repeat(40)
  });
  assert.equal(await f.run(), true);
  assert.equal(f.store.admin.username, "ultron-admin");
  assert.deepEqual(f.store.admin.password, { hash: "hashed:" + "A".repeat(40) });
  assert.equal(f.calls.persisted, 1);
  assert.equal(f.calls.audits.length, 1);
});

test("bootstrap is a no-op when credentials are absent", async () => {
  const f = fixture();
  assert.equal(await f.run(), false);
  assert.equal(f.store.admin, null);
  assert.equal(f.calls.persisted, 0);
});

test("bootstrap never overwrites an existing administrator", async () => {
  const f = fixture({
    ULTRON_BOOTSTRAP_ADMIN_USERNAME: "replacement",
    ULTRON_BOOTSTRAP_ADMIN_PASSWORD: "B".repeat(40)
  });
  f.store.admin = { username: "existing", password: { hash: "existing-hash" } };
  assert.equal(await f.run(), false);
  assert.equal(f.store.admin.username, "existing");
  assert.equal(f.calls.persisted, 0);
});

test("bootstrap rejects incomplete or weak credentials without exposing them", async () => {
  for (const env of [
    { ULTRON_BOOTSTRAP_ADMIN_USERNAME: "ultron-admin" },
    { ULTRON_BOOTSTRAP_ADMIN_PASSWORD: "short" },
    { ULTRON_BOOTSTRAP_ADMIN_USERNAME: "bad name", ULTRON_BOOTSTRAP_ADMIN_PASSWORD: "C".repeat(40) }
  ]) {
    const f = fixture(env);
    await assert.rejects(f.run(), /Invalid ULTRON bootstrap administrator configuration/);
  }
});
