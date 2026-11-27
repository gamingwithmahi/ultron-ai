"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CPU_LABEL = /(?:^|[^a-z])(?:cpu|soc|package|core|x86_pkg)(?:$|[^a-z])/i;

function toCelsius(raw) {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value)) return null;
  const celsius = Math.abs(value) >= 1000 ? value / 1000 : value;
  return celsius >= -20 && celsius <= 150 ? Math.round(celsius * 10) / 10 : null;
}

async function readText(file) {
  try {
    return await fs.promises.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function readCpuTemperature(options = {}) {
  const thermalRoot = options.thermalRoot || "/sys/class/thermal";
  const hwmonRoot = options.hwmonRoot || "/sys/class/hwmon";
  const readings = [];

  try {
    const entries = await fs.promises.readdir(thermalRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!/^thermal_zone\d+$/.test(entry.name)) continue;
      const dir = path.join(thermalRoot, entry.name);
      const [type, raw] = await Promise.all([
        readText(path.join(dir, "type")),
        readText(path.join(dir, "temp"))
      ]);
      if (!type || !CPU_LABEL.test(type.trim()) || raw === null) continue;
      const celsius = toCelsius(raw);
      if (celsius !== null) readings.push({ celsius, source: type.trim() });
    }
  } catch {
    // Thermal sysfs is optional and commonly unavailable in hosted containers.
  }

  try {
    const entries = await fs.promises.readdir(hwmonRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!/^hwmon\d+$/.test(entry.name)) continue;
      const dir = path.join(hwmonRoot, entry.name);
      const chip = (await readText(path.join(dir, "name")) || "").trim();
      const files = await fs.promises.readdir(dir).catch(() => []);
      for (const file of files) {
        const match = /^(temp\d+)_input$/.exec(file);
        if (!match) continue;
        const label = (await readText(path.join(dir, match[1] + "_label")) || "").trim();
        const cpuSource = CPU_LABEL.test(label) || /(?:coretemp|k10temp|zenpower|cpu_thermal)/i.test(chip);
        if (!cpuSource) continue;
        const raw = await readText(path.join(dir, file));
        if (raw === null) continue;
        const celsius = toCelsius(raw);
        if (celsius !== null) readings.push({ celsius, source: label || chip || file });
      }
    }
  } catch {
    // hwmon is also optional; never fabricate a value when it is missing.
  }

  if (!readings.length) return { available: false, celsius: null, source: null };
  const hottest = readings.reduce((best, item) => item.celsius > best.celsius ? item : best);
  return {
    available: true,
    celsius: hottest.celsius,
    source: readings.map(item => item.source).filter(Boolean).join(", ").slice(0, 160)
  };
}

module.exports = { readCpuTemperature, toCelsius };
