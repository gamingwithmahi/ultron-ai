"use strict";

const MAX_TEXT_CHARS = 1500;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

function failure(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readAudio(response) {
  const declared = Number(response.headers && response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    throw failure("Voice response exceeded the permitted size.", 502);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_AUDIO_BYTES) throw failure("Voice response exceeded the permitted size.", 502);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const chunk = Buffer.from(item.value);
      total += chunk.length;
      if (total > MAX_AUDIO_BYTES) {
        await reader.cancel().catch(() => {});
        throw failure("Voice response exceeded the permitted size.", 502);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function synthesizeSpeech(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text || text.length > MAX_TEXT_CHARS) {
    throw failure("Voice text must contain between 1 and " + MAX_TEXT_CHARS + " characters.", 400);
  }
  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || "").trim();
  if (!apiKey || !voiceId) {
    throw failure("ElevenLabs voice is not configured on the server.", 503);
  }
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(voiceId)) {
    throw failure("Configured ElevenLabs voice ID is invalid.", 503);
  }
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID).trim();
  let response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (cause) {
    const timedOut = cause && (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw failure(timedOut ? "ElevenLabs voice request timed out." : "ElevenLabs voice service could not be reached.", timedOut ? 504 : 502);
  }
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: "ultron_elevenlabs_failure",
      status: response.status,
      voiceIdConfigured: true,
      modelId
    }));
    if (response.status === 401) {
      throw failure("ElevenLabs rejected the API key (401). Replace ELEVENLABS_API_KEY with an active key from the correct ElevenLabs account.", 503);
    }
    if (response.status === 403) {
      throw failure("ElevenLabs denied access (403). Check that this API key has Text to Speech permission and that the selected voice is available to this account.", 503);
    }
    if (response.status === 404) {
      throw failure("ElevenLabs could not find this voice (404). Check ELEVENLABS_VOICE_ID in Render.", 503);
    }
    if (response.status === 422) {
      throw failure("ElevenLabs rejected the voice or model settings (422). Check ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID.", 503);
    }
    if (response.status === 429) {
      throw failure("ElevenLabs rate limit or usage quota reached.", 429);
    }
    throw failure("ElevenLabs voice generation failed (HTTP " + response.status + ").", 502);
  }
  const contentType = String(response.headers && response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("audio/")) {
    throw failure("ElevenLabs returned an unexpected response format.", 502);
  }
  const audio = await readAudio(response);
  if (!audio.length) throw failure("ElevenLabs returned an empty audio response.", 502);
  return { audio, contentType: "audio/mpeg", modelId };
}

module.exports = { synthesizeSpeech, MAX_TEXT_CHARS, MAX_AUDIO_BYTES };
