"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const safety = require("../lib/http-safety");

test("cookie parser handles ordinary cookies and values containing equals", () => {
  const cookies = safety.parseCookies("session=abc; preference=a%3Db; theme=dark");
  assert.equal(cookies.session, "abc");
  assert.equal(cookies.preference, "a=b");
  assert.equal(cookies.theme, "dark");
});

test("cookie parser ignores malformed encodings and duplicate cookie names safely", () => {
  const cookies = safety.parseCookies("good=value; broken=%E0%A4%A; good=attacker; =empty");
  assert.equal(cookies.good, "value");
  assert.equal(Object.hasOwn(cookies, "broken"), false);
  assert.equal(Object.getPrototypeOf(cookies), null);
});

test("cookie parser cannot mutate object prototypes through cookie names", () => {
  const cookies = safety.parseCookies("__proto__=polluted; constructor=unsafe; normal=ok");
  assert.equal(Object.getPrototypeOf(cookies), null);
  assert.equal(cookies.normal, "ok");
  assert.equal({}.polluted, undefined);
});

test("HTTP error status preserves valid client and server status codes only", () => {
  assert.equal(safety.errorStatus({ status: 400 }), 400);
  assert.equal(safety.errorStatus({ statusCode: 413 }), 413);
  assert.equal(safety.errorStatus({ status: 302 }), 500);
  assert.equal(safety.errorStatus(new Error("secret detail")), 500);
});

test("public error responses never expose internal exception messages", () => {
  for (const status of [400, 401, 403, 404, 413, 415, 429, 500, 503]) {
    const message = safety.publicError(status);
    assert.ok(message);
    assert.ok(!message.includes("secret"));
  }
});

test("server applies no-store to API responses and hides runtime details from public status", () => {
  const fs = require("node:fs");
  const server = fs.readFileSync(require.resolve("../server.js"), "utf8");
  assert.ok(server.includes('app.use("/api",(req,res,next)=>{res.set("Cache-Control","no-store")'));
  assert.ok(server.includes('app.get("/api/status",(_q,r)=>r.json({status:"online",name:"ULTRON"}))'));
  assert.ok(server.includes("httpSafety.parseCookies"));
  assert.ok(server.includes("httpSafety.errorStatus(e)"));
});
