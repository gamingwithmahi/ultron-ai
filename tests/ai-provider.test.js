"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAssistantReply, extractText } = require("../lib/ai-provider");

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test("extractText supports Gemini candidates and OpenAI Responses output", () => {
  assert.equal(extractText({ candidates: [{ content: { parts: [{ text: "Hello" }, { text: "ULTRON" }] } }] }), "Hello\nULTRON");
  assert.equal(extractText({ output_text: "  direct response  " }), "direct response");
  assert.equal(extractText({ output: [{ type: "message", content: [{ type: "output_text", text: "nested" }] }] }), "nested");
  assert.equal(extractText({}), "");
});

test("Gemini is the default provider when its key is configured", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: undefined, GEMINI_API_KEY: "test-gemini-key", GEMINI_MODEL: "gemini-test", OPENAI_API_KEY: undefined }, async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        modelVersion: "gemini-test",
        candidates: [{ content: { parts: [{ text: "Hello from Gemini" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const result = await generateAssistantReply([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "continue" }
      ], "workspace context");
      assert.equal(result.text, "Hello from Gemini");
      assert.equal(result.provider, "gemini");
      assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
      assert.equal(request.options.headers["x-goog-api-key"], "test-gemini-key");
      assert.equal(request.options.headers.Authorization, undefined);
      assert.equal(request.body.contents[1].role, "model");
      assert.equal(request.body.contents[2].role, "user");
      assert.match(request.body.systemInstruction.parts[0].text, /workspace context/);
      assert.equal(request.body.generationConfig.maxOutputTokens, 900);
    } finally { global.fetch = previousFetch; }
  });
});

test("Gemini reports missing credentials without exposing secrets", async () => {
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: undefined }, async () => {
    await assert.rejects(generateAssistantReply([]), error => error.status === 503 && /GEMINI_API_KEY/.test(error.message));
  });
});

test("Gemini maps authentication, quota and upstream errors safely", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key" }, async () => {
    for (const [status, expected, pattern] of [
      [401, 503, /rejected the configured API key/],
      [429, 429, /quota reached/],
      [500, 502, /request failed/]
    ]) {
      global.fetch = async () => new Response(JSON.stringify({ error: { message: "private provider detail" } }), { status });
      await assert.rejects(generateAssistantReply([]), error =>
        error.status === expected && pattern.test(error.message) && !error.message.includes("private provider detail"));
    }
    global.fetch = async () => { const error = new Error("private socket detail"); error.name = "TimeoutError"; throw error; };
    await assert.rejects(generateAssistantReply([]), error => error.status === 504 && /timed out/.test(error.message));
  });
  global.fetch = previousFetch;
});

test("Gemini rejects empty candidate output and bounds provider responses", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key" }, async () => {
    global.fetch = async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    await assert.rejects(generateAssistantReply([]), error => error.status === 502 && /no text output/.test(error.message));
    global.fetch = async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 });
    await assert.rejects(generateAssistantReply([]), error => error.status === 502 && /size/.test(error.message));
  });
  global.fetch = previousFetch;
});

test("explicit OpenAI selection remains supported as a deliberate fallback", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key", OPENAI_MODEL: "test-model" }, async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        id: "resp_test", model: "test-model",
        output: [{ type: "message", content: [{ type: "output_text", text: "Hello from OpenAI" }] }]
      }), { status: 200 });
    };
    try {
      const result = await generateAssistantReply([{ role: "user", content: "hello" }], "safe context");
      assert.equal(result.text, "Hello from OpenAI");
      assert.equal(result.provider, "openai");
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      assert.equal(request.options.headers.Authorization, "Bearer test-openai-key");
      assert.equal(request.body.store, false);
      assert.match(request.body.instructions, /safe context/);
    } finally { global.fetch = previousFetch; }
  });
});
