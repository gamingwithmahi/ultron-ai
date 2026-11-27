"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFINITIONS, buildAgentRegistry, getAgent } = require("../lib/agent-orchestrator");

test("agent registry exposes every defined agent with stable unique IDs", () => {
  const registry = buildAgentRegistry();
  const ids = registry.agents.map(agent => agent.id);
  assert.equal(registry.summary.total, DEFINITIONS.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, DEFINITIONS.map(agent => agent.id));
});

test("provider-dependent personal assistant is unavailable without configuration", () => {
  const agent = getAgent("personal");
  assert.equal(agent.status, "provider_required");
  assert.equal(agent.canRun, false);
  assert.equal(getAgent("personal", { openAiConfigured: true }).status, "available");
  assert.equal(getAgent("personal", { openAiConfigured: true }).canRun, true);
});

test("Google agents become connected only when their service is explicitly present", () => {
  const disconnected = buildAgentRegistry();
  assert.equal(disconnected.agents.find(agent => agent.id === "gmail").status, "connect_required");
  assert.equal(disconnected.agents.find(agent => agent.id === "calendar").status, "connect_required");

  const connected = buildAgentRegistry({ connectedServices: ["gmail", "calendar"] });
  assert.equal(connected.agents.find(agent => agent.id === "gmail").status, "connected");
  assert.equal(connected.agents.find(agent => agent.id === "calendar").status, "connected");
  assert.equal(connected.summary.connected, 2);
});

test("planned agents and simulation-only trading cannot run as live agents", () => {
  const registry = buildAgentRegistry({ openAiConfigured: true });
  const youtube = registry.agents.find(agent => agent.id === "youtube");
  const trading = registry.agents.find(agent => agent.id === "trading");
  assert.equal(youtube.status, "planned");
  assert.equal(youtube.canRun, false);
  assert.equal(trading.status, "simulation_only");
  assert.equal(trading.canRun, false);
  assert.equal(registry.safety.externalWritesEnabled, false);
  assert.equal(registry.safety.realMoneyTradingEnabled, false);
  assert.equal(registry.centralBrain.autonomousExternalActions, false);
});

test("unknown agent IDs resolve to null", () => {
  assert.equal(getAgent("not-a-real-agent"), null);
});
