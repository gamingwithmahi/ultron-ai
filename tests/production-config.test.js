"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProductionEnvironment } = require("../lib/production-config");

const validProduction = {
  NODE_ENV: "production",
  ULTRON_SETUP_KEY: "s".repeat(48),
  ULTRON_SESSION_SECRET: "x".repeat(64),
  ULTRON_TOKEN_ENCRYPTION_KEY: "k".repeat(48),
  DATABASE_URL: "postgresql://ultron:secret@db.example.com:5432/ultron"
};

test("development and test environments do not require production secrets", () => {
  assert.deepEqual(validateProductionEnvironment({ NODE_ENV: "development" }), []);
  assert.deepEqual(validateProductionEnvironment({ NODE_ENV: "test" }), []);
});

test("production accepts strong secrets and a PostgreSQL URL", () => {
  assert.deepEqual(validateProductionEnvironment(validProduction), []);
});

test("production blocks startup when required secrets or durable storage are missing", () => {
  const errors = validateProductionEnvironment({ NODE_ENV: "production" });
  assert.equal(errors.length, 4);
  assert.ok(errors.some(item => item.includes("ULTRON_SETUP_KEY")));
  assert.ok(errors.some(item => item.includes("ULTRON_SESSION_SECRET")));
  assert.ok(errors.some(item => item.includes("ULTRON_TOKEN_ENCRYPTION_KEY")));
  assert.ok(errors.some(item => item.includes("DATABASE_URL")));
  assert.equal(errors.join(" ").includes("secret@"), false);
});

test("production rejects weak or placeholder secrets", () => {
  const errors = validateProductionEnvironment({
    ...validProduction,
    ULTRON_SETUP_KEY: "replace-with-weak-key",
    ULTRON_SESSION_SECRET: "short",
    ULTRON_TOKEN_ENCRYPTION_KEY: "YOUR-KEY"
  });
  assert.equal(errors.length, 3);
});

test("production rejects non-PostgreSQL and malformed database URLs", () => {
  for (const DATABASE_URL of ["https://example.com", "not-a-url", "mysql://user:pass@db.example.com/app"]) {
    const errors = validateProductionEnvironment({ ...validProduction, DATABASE_URL });
    assert.ok(errors.some(item => item.includes("DATABASE_URL")));
  }
});

test("validation errors identify variable names but never echo secret values", () => {
  const marker = "do-not-leak-this-secret";
  const errors = validateProductionEnvironment({
    NODE_ENV: "production",
    ULTRON_SETUP_KEY: marker,
    ULTRON_SESSION_SECRET: marker,
    ULTRON_TOKEN_ENCRYPTION_KEY: marker,
    DATABASE_URL: "invalid"
  });
  assert.equal(errors.join(" ").includes(marker), false);
});

test("production rejects disabled PostgreSQL TLS", () => {
  const errors = validateProductionEnvironment({ ...validProduction, PGSSLMODE: "disable" });
  assert.ok(errors.some(item => item.includes("PGSSLMODE")));
});

test("production accepts encrypted Render internal PostgreSQL mode", () => {
  assert.deepEqual(validateProductionEnvironment({ ...validProduction, PGSSLMODE: "require" }), []);
});

test("production accepts certificate-verified external PostgreSQL mode", () => {
  assert.deepEqual(validateProductionEnvironment({ ...validProduction, PGSSLMODE: "verify-full" }), []);
});
