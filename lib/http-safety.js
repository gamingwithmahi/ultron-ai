"use strict";

function safeDecode(value) {
  try { return decodeURIComponent(value); }
  catch { return null; }
}

function parseCookies(header) {
  const result = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const item = part.trim();
    if (!item) continue;
    const index = item.indexOf("=");
    if (index <= 0) continue;
    const name = safeDecode(item.slice(0, index).trim());
    const value = safeDecode(item.slice(index + 1).trim());
    if (name === null || value === null || !name || Object.prototype.hasOwnProperty.call(result, name)) continue;
    result[name] = value;
  }
  return result;
}

function errorStatus(error) {
  const candidate = Number(error && (error.status || error.statusCode));
  return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

function publicError(status) {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Authentication required";
  if (status === 403) return "Request is not permitted";
  if (status === 404) return "Resource not found";
  if (status === 413) return "Request body too large";
  if (status === 415) return "Unsupported media type";
  if (status === 429) return "Too many requests";
  if (status >= 500) return "Internal server error";
  return "Request could not be completed";
}

module.exports = { parseCookies, errorStatus, publicError };
