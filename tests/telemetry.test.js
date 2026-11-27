"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { readCpuTemperature, toCelsius } = require("../lib/telemetry");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ultron-telemetry-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("temperature conversion handles millidegrees and ordinary Celsius", () => {
  assert.equal(toCelsius("47250\n"), 47.3);
  assert.equal(toCelsius("47.25"), 47.3);
  assert.equal(toCelsius("not-a-number"), null);
  assert.equal(toCelsius("250000"), null);
});

test("reads the hottest CPU thermal zone and ignores unrelated sensors", async t => {
  const root = await fixture(t);
  const thermal = path.join(root, "thermal");
  const hwmon = path.join(root, "hwmon");
  for (const [name, type, temp] of [
    ["thermal_zone0", "cpu-0-thermal", "42125"],
    ["thermal_zone1", "cpu-1-thermal", "48750"],
    ["thermal_zone2", "battery", "55000"]
  ]) {
    const dir = path.join(thermal, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "type"), type);
    await fs.writeFile(path.join(dir, "temp"), temp);
  }
  const result = await readCpuTemperature({ thermalRoot: thermal, hwmonRoot: hwmon });
  assert.equal(result.available, true);
  assert.equal(result.celsius, 48.8);
  assert.match(result.source, /cpu-1-thermal/);
  assert.doesNotMatch(result.source, /battery/);
});

test("returns unavailable instead of inventing a temperature when sensors are absent", async t => {
  const root = await fixture(t);
  const result = await readCpuTemperature({
    thermalRoot: path.join(root, "missing-thermal"),
    hwmonRoot: path.join(root, "missing-hwmon")
  });
  assert.deepEqual(result, { available: false, celsius: null, source: null });
});

test("reads CPU package labels from hwmon sensors", async t => {
  const root = await fixture(t);
  const hwmon = path.join(root, "hwmon");
  const dir = path.join(hwmon, "hwmon0");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "name"), "k10temp");
  await fs.writeFile(path.join(dir, "temp1_input"), "61000");
  await fs.writeFile(path.join(dir, "temp1_label"), "Tctl");
  const result = await readCpuTemperature({
    thermalRoot: path.join(root, "thermal"),
    hwmonRoot: hwmon
  });
  assert.equal(result.available, true);
  assert.equal(result.celsius, 61);
  assert.equal(result.source, "Tctl");
});
