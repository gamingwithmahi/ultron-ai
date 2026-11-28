"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAssistantReply, extractText, GEMINI_TIMEOUT_MS } = require("../lib/ai-provider");

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

test("Gemini uses a bounded 35-second request timeout", () => {
  assert.equal(GEMINI_TIMEOUT_MS, 35000);
});

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
      assert.match(request.body.systemInstruction.parts[0].text, /50-PERCENT UNDERSTANDING RULE/);
      assert.match(request.body.systemInstruction.parts[0].text, /never use inferred intent as consent/);
      assert.match(request.body.systemInstruction.parts[0].text, /speech recognition mistakes/);
      assert.equal(request.body.generationConfig.maxOutputTokens, 700);
    } finally { global.fetch = previousFetch; }
  });
});

test("Gemini defaults to the current supported Flash model", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key", GEMINI_MODEL: undefined }, async () => {
    global.fetch = async url => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
      return new Response(JSON.stringify({
        modelVersion: "gemini-3.5-flash-lite",
        candidates: [{ content: { parts: [{ text: "OK" }] } }]
      }), { status: 200 });
    };
    try {
      const result = await generateAssistantReply([{ role: "user", content: "Reply OK" }]);
      assert.equal(result.text, "OK");
      assert.equal(result.model, "gemini-3.5-flash-lite");
    } finally { global.fetch = previousFetch; }
  });
});

test("Gemini retries one temporary 503 with a short delay and requests low thinking", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key", GEMINI_MODEL: "gemini-test" }, async () => {
    let attempts = 0;
    global.fetch = async (_url, options) => {
      attempts++;
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
      assert.equal(options.signal && typeof options.signal.aborted, "boolean");
      if (attempts === 1) return new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Fast reply" }] } }] }), { status: 200 });
    };
    try {
      const result = await generateAssistantReply([{ role: "user", content: "Hi" }]);
      assert.equal(result.text, "Fast reply");
      assert.equal(attempts, 2);
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
    await assert.rejects(generateAssistantReply([]), error => error.status === 504 && /taking too long/.test(error.message));
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


test("ULTRON is instructed to infer up to half of an unclear request from context", async () => {
  const previousFetch = global.fetch;
  await withEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-gemini-key", GEMINI_MODEL: "gemini-test" }, async () => {
    let instructions = "";
    global.fetch = async (_url, options) => {
      instructions = JSON.parse(options.body).systemInstruction.parts[0].text;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "I understood your likely request." }] } }]
      }), { status: 200 });
    };
    try {
      await generateAssistantReply([
        { role: "user", content: "আমার আগের কাজটা ঠিক করে দাও" },
        { role: "assistant", content: "আপনি ULTRON-এর Approval Center নিয়ে কাজ করছিলেন।" },
        { role: "user", content: "ওটা আরও নিরাপদ করো" }
      ]);
      assert.match(instructions, /50-PERCENT UNDERSTANDING RULE/);
      assert.match(instructions, /current task, known project state/);
      assert.match(instructions, /Do not demand perfect wording/);
      assert.match(instructions, /several interpretations remain similarly plausible/);
      assert.match(instructions, /never use inferred intent as consent/);
    } finally { global.fetch = previousFetch; }
  });
});
