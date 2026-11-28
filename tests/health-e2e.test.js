"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("ULTRON exited before health became ready: " + output.join("").slice(-3000));
    }
    try {
      const response = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(1000) });
      return response;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error("ULTRON health endpoint did not become ready: " + String(lastError) + "\n" + output.join("").slice(-3000));
}

test("server boots in an isolated data directory and exposes truthful health telemetry", { timeout: 20000 }, async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ultron-e2e-"));
  const port = await reservePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const output = [];
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      ULTRON_DATA_DIR: tempDir,
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => output.push(chunk.toString()));
  child.stderr.on("data", chunk => output.push(chunk.toString()));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const response = await waitForHealth(baseUrl, child, output);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const first = await response.json();
  assert.equal(first.ok, true);
  assert.equal(first.name, "ULTRON");
  assert.equal(first.database, "file");
  assert.ok(Number.isFinite(first.uptimeSeconds) && first.uptimeSeconds >= 0);
  assert.ok(first.cpuTemperature && typeof first.cpuTemperature.available === "boolean");
  if (first.cpuTemperature.available) {
    assert.ok(Number.isFinite(first.cpuTemperature.celsius));
    assert.ok(first.cpuTemperature.celsius >= -20 && first.cpuTemperature.celsius <= 150);
  } else {
    assert.equal(first.cpuTemperature.celsius, null);
  }
  assert.ok(Number.isFinite(Date.parse(first.timestamp)));

  await new Promise(resolve => setTimeout(resolve, 80));
  const secondResponse = await fetch(baseUrl + "/api/health");
  const second = await secondResponse.json();
  assert.ok(second.uptimeSeconds >= first.uptimeSeconds);

  const privateOverview = await fetch(baseUrl + "/api/overview");
  assert.equal(privateOverview.status, 401);

  const home = await fetch(baseUrl + "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") || "", /text\/html/);
  const script = await fetch(baseUrl + "/app.js");
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") || "", /javascript/);

  const missingAsset = await fetch(baseUrl + "/missing-asset.js");
  assert.equal(missingAsset.status, 404);
  assert.equal((missingAsset.headers.get("content-type") || "").includes("text/html"), false);

  const files = await fs.readdir(tempDir);
  assert.ok(files.includes("store.json"));
});
