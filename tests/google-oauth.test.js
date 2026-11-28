const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const oauth = require("../lib/google-oauth");

test("Google connector requests read-only scopes separately", () => {
  assert.deepEqual(oauth.SCOPES.gmail, ["https://www.googleapis.com/auth/gmail.readonly"]);
  assert.deepEqual(oauth.SCOPES.calendar, ["https://www.googleapis.com/auth/calendar.readonly"]);
  assert.ok(!JSON.stringify(oauth.SCOPES).includes("gmail.send"));
  assert.ok(!JSON.stringify(oauth.SCOPES).includes("calendar.events"));
});
test("Google token encryption authenticates ciphertext", () => {
  const key = crypto.randomBytes(32);
  const input = { access_token: "example", refresh_token: "secret" };
  const encrypted = oauth.encrypt(input, key);
  assert.deepEqual(oauth.decrypt(encrypted, key), input);
  assert.throws(() => oauth.decrypt(encrypted, crypto.randomBytes(32)));
});
test("Google OAuth remains unavailable until all server secrets are configured", () => {
  const keys = ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REDIRECT_URI","ULTRON_TOKEN_ENCRYPTION_KEY"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    keys.forEach(k => delete process.env[k]);
    assert.equal(oauth.config(), null);
    assert.throws(() => oauth.buildAuthUrl("gmail", "state"), /not configured/);
  } finally {
    for (const k of keys) old[k] === undefined ? delete process.env[k] : process.env[k] = old[k];
  }
});


test("Google OAuth code exchange uses a bounded request and stores encrypted tokens", async () => {
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "ULTRON_TOKEN_ENCRYPTION_KEY"];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousFetch = global.fetch;
  keys.forEach((key, index) => {
    process.env[key] = ["client-id", "client-secret", "https://example.test/callback", "x".repeat(40)][index];
  });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ access_token: "access-test", refresh_token: "refresh-test", expires_in: 3600, scope: oauth.SCOPES.gmail.join(" ") }) };
  };
  try {
    const result = await oauth.exchangeCode("authorization-code");
    assert.equal(request.url, "https://oauth2.googleapis.com/token");
    assert.equal(request.options.method, "POST");
    assert.ok(request.options.signal instanceof AbortSignal);
    assert.ok(result.encrypted.split(".").length === 3);
    assert.ok(result.scopes.includes(oauth.SCOPES.gmail[0]));
    assert.equal(result.encrypted.includes("access-test"), false);
  } finally {
    global.fetch = previousFetch;
    for (const key of keys) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  }
});

test("Google OAuth token exchange safely handles malformed provider JSON", async () => {
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "ULTRON_TOKEN_ENCRYPTION_KEY"];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousFetch = global.fetch;
  keys.forEach((key, index) => {
    process.env[key] = ["client-id", "client-secret", "https://example.test/callback", "y".repeat(40)][index];
  });
  global.fetch = async () => ({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
  try {
    await assert.rejects(oauth.exchangeCode("authorization-code"), /Google token exchange failed/);
  } finally {
    global.fetch = previousFetch;
    for (const key of keys) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  }
});

test("Google refresh requests use a bounded timeout and preserve the refresh token", async () => {
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "ULTRON_TOKEN_ENCRYPTION_KEY"];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousFetch = global.fetch;
  keys.forEach((key, index) => {
    process.env[key] = ["client-id", "client-secret", "https://example.test/callback", "z".repeat(40)][index];
  });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ access_token: "new-access", expires_in: 3600 }) };
  };
  try {
    const cfg = oauth.config();
    const encrypted = oauth.encrypt({ access_token: "old-access", refresh_token: "keep-refresh", expiry_date: 1 }, cfg.key);
    const result = await oauth.readTokens(encrypted);
    assert.equal(request.url, "https://oauth2.googleapis.com/token");
    assert.ok(request.options.signal instanceof AbortSignal);
    assert.equal(result.accessToken, "new-access");
    assert.ok(result.encrypted.split(".").length === 3);
    assert.equal(result.scopes.length, 0);
  } finally {
    global.fetch = previousFetch;
    for (const key of keys) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  }
});


test("Google user profile lookup has a bounded timeout and safely handles non-success responses", async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ email: "operator@example.test" }) };
  };
  try {
    const profile = await oauth.fetchUserInfo("access-token");
    assert.equal(request.url, "https://openidconnect.googleapis.com/v1/userinfo");
    assert.ok(request.options.signal instanceof AbortSignal);
    assert.equal(profile.email, "operator@example.test");
    global.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: false, json: async () => ({ error: "unauthorized" }) };
    };
    assert.deepEqual(await oauth.fetchUserInfo("expired-token"), {});
    await assert.rejects(oauth.fetchUserInfo(""), /access token is required/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Google token revocation uses a bounded timeout and sends form-encoded token", async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };
  try {
    assert.equal(await oauth.revokeToken("refresh-token"), true);
    assert.equal(request.url, "https://oauth2.googleapis.com/revoke");
    assert.equal(request.options.method, "POST");
    assert.ok(request.options.signal instanceof AbortSignal);
    assert.equal(request.options.body.get("token"), "refresh-token");
    assert.equal(await oauth.revokeToken(""), false);
  } finally {
    global.fetch = previousFetch;
  }
});
