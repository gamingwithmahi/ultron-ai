const test = require("node:test");
const assert = require("node:assert/strict");
const { extractText, generateAssistantReply } = require("../lib/ai-provider");

test("Responses API output text is extracted from message content", () => {
  const result = extractText({ output: [{ type: "message", content: [{ type: "output_text", text: "ULTRON ready." }] }] });
  assert.equal(result, "ULTRON ready.");
});

test("empty provider output is represented as empty text", () => {
  assert.equal(extractText({ output: [] }), "");
});

test("assistant provider refuses requests without a server-side API key", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(generateAssistantReply([{ role: "user", content: "Hello" }]), error => error.status === 503);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});
