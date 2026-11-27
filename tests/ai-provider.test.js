"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAssistantReply, extractText } = require("../lib/ai-provider");

test("extractText prefers the Responses API output_text shortcut", () => {
  assert.equal(extractText({
    output_text: "  direct response  ",
    output: [{ type: "message", content: [{ type: "output_text", text: "nested" }] }]
  }), "direct response");
});

test("extractText joins only message output_text parts", () => {
  const payload = {
    output: [
      { type: "reasoning", content: [{ type: "output_text", text: "ignore this" }] },
      { type: "message", content: [
        { type: "input_text", text: "ignore this too" },
        { type: "output_text", text: "first part" },
        { type: "output_text", text: "second part" }
      ] }
    ]
  };
  assert.equal(extractText(payload), "first part\nsecond part");
});

test("extractText safely returns empty text for absent or malformed output", () => {
  assert.equal(extractText({}), "");
  assert.equal(extractText({ output: null }), "");
  assert.equal(extractText({ output: [{ type: "message", content: "not-an-array" }] }), "");
});

test("provider reports a configuration error when the API key is absent", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      generateAssistantReply([]),
      error => error.status === 503 && /not configured/.test(error.message)
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("provider sends a non-persistent Responses API request and extracts its reply", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key-not-a-real-credential";
  process.env.OPENAI_MODEL = "test-model";
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_test",
        model: "test-model",
        output: [{ type: "message", content: [{ type: "output_text", text: "Hello from test" }] }]
      })
    };
  };
  try {
    const result = await generateAssistantReply([{ role: "user", content: "hello" }], "safe context");
    assert.equal(result.text, "Hello from test");
    assert.equal(result.responseId, "resp_test");
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.options.headers.Authorization, "Bearer test-key-not-a-real-credential");
    assert.equal(request.body.store, false);
    assert.equal(request.body.model, "test-model");
    assert.match(request.body.instructions, /safe context/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  }
});

test("provider maps authentication, quota, and upstream failures to safe errors", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key-not-a-real-credential";
  try {
    for (const [status, expectedStatus, expectedText] of [
      [401, 503, /rejected the configured API key/],
      [429, 429, /rate limit or quota reached/],
      [500, 502, /request failed/]
    ]) {
      global.fetch = async () => ({
        ok: false,
        status,
        json: async () => ({ error: { message: "sensitive upstream detail" } })
      });
      await assert.rejects(
        generateAssistantReply([]),
        error => error.status === expectedStatus &&
          expectedText.test(error.message) &&
          !error.message.includes("sensitive upstream detail")
      );
    }
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("provider rejects successful responses that contain no assistant text", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key-not-a-real-credential";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ output: [] }) });
  try {
    await assert.rejects(
      generateAssistantReply([]),
      error => error.status === 502 && /no text output/.test(error.message)
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
