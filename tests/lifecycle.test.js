"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createShutdownHandler } = require("../lib/lifecycle");

function quietLogger() {
  return { info() {}, error() {} };
}

test("shutdown closes HTTP server, worker, then database pool", async () => {
  const calls = [];
  const server = { close(callback) { calls.push("server"); callback(); } };
  const worker = { async stop() { calls.push("worker"); } };
  const pool = { async end() { calls.push("pool"); } };
  const shutdown = createShutdownHandler({ server, worker, pool, logger: quietLogger() });

  assert.equal(await shutdown("SIGTERM"), true);
  assert.deepEqual(calls, ["server", "worker", "pool"]);
});

test("repeated signals share one shutdown operation", async () => {
  let closeCount = 0;
  let workerCount = 0;
  const server = { close(callback) { closeCount += 1; setImmediate(callback); } };
  const worker = { async stop() { workerCount += 1; } };
  const shutdown = createShutdownHandler({ server, worker, logger: quietLogger() });

  const first = shutdown("SIGTERM");
  const second = shutdown("SIGINT");
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(closeCount, 1);
  assert.equal(workerCount, 1);
});

test("shutdown supports a server without optional worker or database", async () => {
  const shutdown = createShutdownHandler({
    server: { close(callback) { callback(); } },
    logger: quietLogger()
  });
  assert.equal(await shutdown(), true);
});

test("shutdown reports close failures and exits unsuccessfully", async () => {
  const exits = [];
  const shutdown = createShutdownHandler({
    server: { close(callback) { callback(new Error("close failed")); } },
    logger: quietLogger(),
    exit: code => exits.push(code)
  });

  assert.equal(await shutdown("SIGTERM"), false);
  assert.deepEqual(exits, [1]);
});

test("shutdown timeout closes active connections and exits", async () => {
  const calls = [];
  const shutdown = createShutdownHandler({
    server: {
      close() {},
      closeAllConnections() { calls.push("connections"); }
    },
    logger: quietLogger(),
    exit: code => calls.push("exit:" + code),
    timeoutMs: 5
  });

  shutdown("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(calls, ["connections", "exit:1"]);
});
