"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfigurationReport } = require("../lib/configuration");

test("configuration report marks placeholders as missing and never exposes secret values", () => {
  const report = buildConfigurationReport({
    ULTRON_SETUP_KEY: "replace-with-setup-key",
    ULTRON_SESSION_SECRET: "real-session-secret-for-test-only",
    OPENAI_API_KEY: "test-api-secret"
  });
  const flat = report.groups.flatMap(group => group.items);
  assert.equal(flat.find(item => item.key === "ULTRON_SETUP_KEY").status, "missing");
  assert.equal(flat.find(item => item.key === "ULTRON_SESSION_SECRET").status, "configured");
  assert.equal(flat.find(item => item.key === "OPENAI_API_KEY").configured, true);
  assert.equal(report.secretValuesExposed, false);
  assert.equal(JSON.stringify(report).includes("test-api-secret"), false);
  assert.equal(JSON.stringify(report).includes("real-session-secret-for-test-only"), false);
});

test("configuration report identifies required missing values and defaulted model", () => {
  const report = buildConfigurationReport({});
  assert.ok(report.requiredMissing.includes("ULTRON_SESSION_SECRET"));
  assert.ok(report.requiredMissing.includes("DATABASE_URL"));
  const model = report.groups.flatMap(group => group.items).find(item => item.key === "OPENAI_MODEL");
  assert.equal(model.status, "defaulted");
  assert.equal(model.configured, true);
  assert.equal(model.defaultValue, "gpt-6.2-astra");
});
