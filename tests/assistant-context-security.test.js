"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { safeText, buildAssistantContext } = require("../lib/assistant-context");

test("safeText redacts common credential labels and preserves ordinary text", () => {
  for (const value of [
    "password: example-password",
    "passphrase = do-not-share",
    "GEMINI_API_KEY=example-key",
    "api key: example-key",
    "refresh_token: example-token",
    "private key = example-private-key",
    "one-time code: 123456"
  ]) {
    assert.equal(safeText(value), "[sensitive-looking content omitted]");
    assert.equal(safeText(value).includes(value.split(/[:=]/)[1]?.trim() || "not-found"), false);
  }
  assert.equal(safeText("I prefer concise Bengali project updates"), "I prefer concise Bengali project updates");
});

test("assistant context never forwards credential-looking query, memory, or task text", () => {
  const result = buildAssistantContext({
    messages: [{ role: "user", content: "Please check this API_KEY: private-example-value" }],
    memories: [
      { id: "m-secret", category: "fact", title: "Credentials", content: "GEMINI_API_KEY=memory-secret-value", tags: [] },
      { id: "m-safe", category: "preference", title: "Style", content: "Prefers concise explanations", tags: ["communication"] }
    ],
    tasks: [
      { title: "Rotate password: task-secret-value", status: "in_progress", priority: "high" }
    ],
    approvals: [{ status: "pending" }]
  });
  assert.equal(result.prompt.includes("private-example-value"), false);
  assert.equal(result.prompt.includes("memory-secret-value"), false);
  assert.equal(result.prompt.includes("task-secret-value"), false);
  assert.equal(result.prompt.includes("Prefers concise explanations"), false);
  assert.equal(result.summary.pendingApprovalCount, 1);
  assert.deepEqual(result.retrievedMemoryIds, []);
});

test("secret redaction also applies when credential text appears in memory metadata", () => {
  const result = buildAssistantContext({
    messages: [{ role: "user", content: "Show project preferences" }],
    memories: [{
      id: "m-meta",
      category: "preference",
      title: "OPENAI_API_KEY=metadata-secret",
      content: "Prefers clear status updates",
      context: "password: context-secret",
      tags: ["safe", "api_key=tag-secret"]
    }]
  });
  assert.equal(result.prompt.includes("metadata-secret"), false);
  assert.equal(result.prompt.includes("context-secret"), false);
  assert.equal(result.prompt.includes("tag-secret"), false);
  assert.equal(result.prompt.includes("Prefers clear status updates"), true);
});
