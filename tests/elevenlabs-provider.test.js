"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { synthesizeSpeech, MAX_AUDIO_BYTES } = require("../lib/elevenlabs-provider");

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test("ElevenLabs provider requires both a server key and voice ID", async () => {
  await withEnv({ ELEVENLABS_API_KEY: undefined, ELEVENLABS_VOICE_ID: undefined }, async () => {
    await assert.rejects(synthesizeSpeech("hello"), error => error.status === 503 && /not configured/.test(error.message));
  });
});

test("ElevenLabs provider sends authenticated bounded TTS requests and returns audio", async () => {
  const previousFetch = global.fetch;
  await withEnv({
    ELEVENLABS_API_KEY: "test-only-secret",
    ELEVENLABS_VOICE_ID: "QO2wwSVI9F7DwU5uUXDX",
    ELEVENLABS_MODEL_ID: "eleven_multilingual_v2"
  }, async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(Buffer.from("fake-audio"), { status: 200, headers: { "content-type": "audio/mpeg" } });
    };
    try {
      const result = await synthesizeSpeech("Hello ULTRON");
      assert.equal(result.audio.toString(), "fake-audio");
      assert.equal(result.contentType, "audio/mpeg");
      assert.equal(request.url, "https://api.elevenlabs.io/v1/text-to-speech/QO2wwSVI9F7DwU5uUXDX");
      assert.equal(request.options.headers["xi-api-key"], "test-only-secret");
      assert.equal(request.options.headers.Accept, "audio/mpeg");
      assert.equal(request.body.model_id, "eleven_multilingual_v2");
      assert.equal(request.body.text, "Hello ULTRON");
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("ElevenLabs provider rejects oversized input and audio output", async () => {
  const previousFetch = global.fetch;
  await withEnv({ ELEVENLABS_API_KEY: "test-only-secret", ELEVENLABS_VOICE_ID: "QO2wwSVI9F7DwU5uUXDX" }, async () => {
    await assert.rejects(synthesizeSpeech("x".repeat(1501)), error => error.status === 400);
    global.fetch = async () => new Response(Buffer.from("tiny"), {
      status: 200,
      headers: { "content-type": "audio/mpeg", "content-length": String(MAX_AUDIO_BYTES + 1) }
    });
    try {
      await assert.rejects(synthesizeSpeech("hello"), error => error.status === 502 && /size/.test(error.message));
    } finally {
      global.fetch = previousFetch;
    }
  });
});

test("ElevenLabs provider hides upstream error details and maps quota errors", async () => {
  const previousFetch = global.fetch;
  await withEnv({ ELEVENLABS_API_KEY: "test-only-secret", ELEVENLABS_VOICE_ID: "QO2wwSVI9F7DwU5uUXDX" }, async () => {
    global.fetch = async () => new Response("private provider detail", { status: 429 });
    try {
      await assert.rejects(synthesizeSpeech("hello"), error =>
        error.status === 429 && /quota/.test(error.message) && !error.message.includes("private provider detail")
      );
    } finally {
      global.fetch = previousFetch;
    }
  });
});
