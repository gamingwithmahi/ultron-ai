"use strict";
const crypto = require("node:crypto");

const SCOPES = {
  gmail: ["https://www.googleapis.com/auth/gmail.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.readonly"]
};
function config() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, ULTRON_TOKEN_ENCRYPTION_KEY } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !ULTRON_TOKEN_ENCRYPTION_KEY) return null;
  let key;
  try { key = Buffer.from(ULTRON_TOKEN_ENCRYPTION_KEY, "base64"); } catch { return null; }
  if (key.length !== 32) return null;
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: GOOGLE_REDIRECT_URI, key };
}
function encrypt(value, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
function decrypt(value, key) {
  const [iv, tag, data] = String(value).split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
}
function buildAuthUrl(service, state) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured on the server");
  if (!SCOPES[service]) throw new Error("Unsupported Google service");
  const params = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code",
    scope: ["openid", "email", ...SCOPES[service]].join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}
async function exchangeCode(code) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google token exchange failed");
  return { encrypted: encrypt(data, cfg.key), scopes: String(data.scope || "").split(" ").filter(Boolean), expiresAt: new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString() };
}
async function readTokens(encrypted) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured");
  let tokens = decrypt(encrypted, cfg.key);
  if (!tokens.access_token || Number(tokens.expiry_date || 0) < Date.now() + 60000) {
    if (!tokens.refresh_token) throw new Error("Google authorization expired; reconnect the account");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" })
    });
    const refreshed = await response.json();
    if (!response.ok || !refreshed.access_token) throw new Error("Google token refresh failed");
    tokens = { ...tokens, ...refreshed, refresh_token: tokens.refresh_token, expiry_date: Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
    return { accessToken: tokens.access_token, encrypted: encrypt(tokens, cfg.key), scopes: String(tokens.scope || "").split(" ").filter(Boolean) };
  }
  return { accessToken: tokens.access_token, encrypted, scopes: String(tokens.scope || "").split(" ").filter(Boolean) };
}
module.exports = { SCOPES, config, buildAuthUrl, exchangeCode, readTokens, encrypt, decrypt };
