"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAssistantReply } = require("../lib/ai-provider");

test("ULTRON uses context-aware emotional intelligence without claiming human feelings", async () => {
  const previousFetch = global.fetch;
  const previousEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL
  };
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-emotion-key";
  process.env.GEMINI_MODEL = "gemini-test";
  let instructions = "";
  global.fetch = async (_url, options) => {
    instructions = JSON.parse(options.body).systemInstruction.parts[0].text;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "আমি বুঝতে চেষ্টা করছি।" }] } }]
    }), { status: 200 });
  };
  try {
    const result = await generateAssistantReply([
      { role: "user", content: "আজকে মনটা খুব খারাপ।" }
    ], "Recent conversation: user is troubleshooting ULTRON.");
    assert.equal(result.text, "আমি বুঝতে চেষ্টা করছি।");
    assert.match(instructions, /EMOTIONAL INTELLIGENCE/);
    assert.match(instructions, /60-70% EMOTIONAL UNDERSTANDING GOAL/);
    assert.match(instructions, /not a measured accuracy guarantee/);
    assert.match(instructions, /EMPATHETIC RESPONSE/);
    assert.match(instructions, /EMOTIONAL MEMORY BOUNDARIES/);
    assert.match(instructions, /Do not save a guessed mood/);
    assert.match(instructions, /accept the correction/);
    assert.match(instructions, /Never diagnose a mental-health condition/);
    assert.match(instructions, /Recent conversation: user is troubleshooting ULTRON/);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
