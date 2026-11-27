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
