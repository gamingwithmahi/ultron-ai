"use strict";
const crypto = require("node:crypto");

const SCOPES = Object.freeze({
  gmail: Object.freeze(["https://www.googleapis.com/auth/gmail.readonly"]),
  calendar: Object.freeze(["https://www.googleapis.com/auth/calendar.readonly"])
});
const TOKEN_TIMEOUT_MS = 10000;
const PROFILE_TIMEOUT_MS = 8000;
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;

function config() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, ULTRON_TOKEN_ENCRYPTION_KEY } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !ULTRON_TOKEN_ENCRYPTION_KEY) return null;
  if (String(ULTRON_TOKEN_ENCRYPTION_KEY).trim().length < 32) return null;
  let redirect;
  try { redirect = new URL(GOOGLE_REDIRECT_URI); } catch { return null; }
  const localHttp = redirect.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if (redirect.protocol !== "https:" && !localHttp) return null;
  if (redirect.username || redirect.password || redirect.hash) return null;
  const key = crypto.createHash("sha256").update(String(ULTRON_TOKEN_ENCRYPTION_KEY)).digest();
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: redirect.toString(), key };
}
function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Google token encryption key must be 32 bytes");
}
function decodeBase64(value, expectedLength) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid encrypted Google token data");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedLength && decoded.length !== expectedLength)) {
    throw new Error("Invalid encrypted Google token data");
  }
  return decoded;
}
function encrypt(value, key) {
  assertKey(key);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Google token data must be serializable");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
function decrypt(value, key) {
  assertKey(key);
  try {
    if (typeof value !== "string" || value.length > MAX_TOKEN_RESPONSE_BYTES) throw new Error("invalid");
    const parts = value.split(".");
    if (parts.length !== 3) throw new Error("invalid");
    const iv = decodeBase64(parts[0], 12);
    const tag = decodeBase64(parts[1], 16);
    const data = decodeBase64(parts[2]);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("Encrypted Google token data is invalid");
  }
}
function buildAuthUrl(service, state) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured on the server");
  if (!Object.prototype.hasOwnProperty.call(SCOPES, service)) throw new Error("Unsupported Google service");
  if (typeof state !== "string" || !/^[A-Za-z0-9._~-]{32,512}$/.test(state)) throw new Error("Invalid Google OAuth state");
  const params = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code",
    scope: ["openid", "email", ...SCOPES[service]].join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}
function tokenExpiry(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw new Error("Google returned an invalid token expiry");
  return Date.now() + seconds * 1000;
}
async function parseTokenResponse(response, failureMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || typeof data.access_token !== "string" || !data.access_token) {
    throw new Error(failureMessage);
  }
  return data;
}
async function exchangeCode(code) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured");
  if (typeof code !== "string" || !code || code.length > 4096) throw new Error("Invalid Google authorization code");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
  });
  const data = await parseTokenResponse(response, "Google token exchange failed");
  const expiry = tokenExpiry(data.expires_in ?? 3600);
  data.expiry_date = expiry;
  return { encrypted: encrypt(data, cfg.key), scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [], expiresAt: new Date(expiry).toISOString() };
}
async function readTokens(encrypted) {
  const cfg = config();
  if (!cfg) throw new Error("Google OAuth is not configured");
  let tokens = decrypt(encrypted, cfg.key);
  if (typeof tokens.access_token !== "string" || !tokens.access_token || !Number.isFinite(Number(tokens.expiry_date)) || Number(tokens.expiry_date) < Date.now() + 60000) {
    if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) throw new Error("Google authorization expired; reconnect the account");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
    });
    const refreshed = await parseTokenResponse(response, "Google token refresh failed");
    const expiry = tokenExpiry(refreshed.expires_in ?? 3600);
    tokens = { ...tokens, ...refreshed, refresh_token: tokens.refresh_token, expiry_date: expiry };
    return { accessToken: tokens.access_token, encrypted: encrypt(tokens, cfg.key), scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ").filter(Boolean) : [] };
  }
  return { accessToken: tokens.access_token, encrypted, scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ").filter(Boolean) : [] };
}
async function fetchUserInfo(accessToken) {
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 16384) throw new Error("Google access token is required");
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS)
  });
  if (!response.ok) return {};
  const profile = await response.json().catch(() => ({}));
  return profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
}
async function revokeToken(token) {
  if (typeof token !== "string" || !token || token.length > 16384) return false;
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS)
    });
    return response.ok;
  } catch {
    return false;
  }
}
module.exports = { SCOPES, config, buildAuthUrl, exchangeCode, readTokens, encrypt, decrypt, fetchUserInfo, revokeToken };
