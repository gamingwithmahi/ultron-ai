"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
const exampleEnv = fs.readFileSync(require.resolve("../.env.example"), "utf8");

test("local server binds only to loopback unless explicitly configured", () => {
  assert.ok(server.includes('HOST=process.env.HOST||(process.env.NODE_ENV==="production"?"0.0.0.0":"127.0.0.1")'));
  assert.ok(exampleEnv.split(/\\r?\\n/).includes("HOST=127.0.0.1"));
});

test("production diagnostics report the actual configured session lifetime", () => {
  assert.ok(server.includes("sessionHours:SESSION_TTL/3600000"));
  assert.ok(server.includes("SESSION_TTL=30*24*60*60*1000"));
});
