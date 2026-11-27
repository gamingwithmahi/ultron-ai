"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const tasks = require("../lib/task-intelligence");

test("task creation validates fields and normalizes dependency lists", () => {
  assert.match(tasks.createTask({ title: "x" }).error, /title/i);
  assert.match(tasks.createTask({ title: "Valid title", priority: "urgent" }).error, /priority/i);
  assert.match(tasks.createTask({ title: "Valid title", estimateMinutes: 2 }).error, /estimate/i);
  const created = tasks.createTask({
    title: "  Ship release  ",
    details: "  Complete release checks  ",
    priority: "high",
    category: "project",
    estimateMinutes: 60,
    dependsOn: ["base", "base"]
  }, [{ id: "base", status: "completed" }], new Date("2026-11-28T00:00:00.000Z"));
  assert.equal(created.value.title, "Ship release");
  assert.equal(created.value.priority, "high");
  assert.deepEqual(created.value.dependsOn, ["base"]);
  assert.equal(created.value.status, "queued");
});

test("task dependency state blocks until every prerequisite is completed", () => {
  const list = [
    { id: "a", title: "Design", status: "completed" },
    { id: "b", title: "Build", status: "in_progress" },
    { id: "c", title: "Release", status: "queued", dependsOn: ["a", "b", "missing"] }
  ];
  const result = tasks.dependencyState(list[2], list);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.missing, ["missing"]);
  assert.deepEqual(result.dependencies.map(item => item.id), ["a", "b"]);
});

test("task ranking prioritizes urgency while penalizing blocked work", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const list = [
    { id: "low", title: "Low", priority: "low", status: "queued", createdAt: now.toISOString() },
    { id: "critical", title: "Critical", priority: "critical", status: "queued", createdAt: now.toISOString(), dueAt: "2026-11-27T00:00:00.000Z" },
    { id: "blocked", title: "Blocked", priority: "high", status: "queued", dependsOn: ["wait"], createdAt: now.toISOString() },
    { id: "wait", title: "Waiting", priority: "normal", status: "in_progress", createdAt: now.toISOString() }
  ];
  const ranked = tasks.rankTasks(list, now);
  assert.equal(ranked[0].id, "critical");
  assert.equal(ranked.find(item => item.id === "blocked").blocked, true);
  assert.ok(ranked.find(item => item.id === "blocked").score < 70);
});

test("task updates prevent completing blocked work and reject dependency cycles", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const a = { id: "a", title: "A", status: "queued", priority: "normal", category: "work", dependsOn: ["b"] };
  const b = { id: "b", title: "B", status: "queued", priority: "normal", category: "work", dependsOn: [] };
  assert.match(tasks.validateTaskUpdate(a, { status: "completed" }, [a, b], now).error, /prerequisite/i);
  assert.match(tasks.validateTaskUpdate(b, { dependsOn: ["a"] }, [a, b], now).error, /cycle/i);
  const updated = tasks.validateTaskUpdate(b, { priority: "critical", status: "in_progress" }, [a, b], now);
  assert.equal(updated.value.priority, "critical");
  assert.equal(updated.value.status, "in_progress");
  const completedB = tasks.validateTaskUpdate(updated.value, { status: "completed" }, [a, updated.value], now);
  assert.equal(completedB.value.status, "completed");
  const completedA = tasks.validateTaskUpdate(a, { status: "completed" }, [a, completedB.value], now);
  assert.equal(completedA.value.status, "completed");
});

test("task summary separates active, completed, overdue, and blocked tasks", () => {
  const now = new Date("2026-11-28T12:00:00.000Z");
  const result = tasks.summarizeTasks([
    { id: "late", title: "Late", priority: "high", status: "queued", dueAt: "2026-11-28T10:00:00.000Z", createdAt: "2026-11-27T00:00:00.000Z" },
    { id: "blocked", title: "Blocked", priority: "normal", status: "queued", dependsOn: ["late"], createdAt: "2026-11-27T00:00:00.000Z" },
    { id: "done", title: "Done", priority: "normal", status: "completed", createdAt: "2026-11-26T00:00:00.000Z" }
  ], now);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.active, 2);
  assert.equal(result.summary.completed, 1);
  assert.equal(result.summary.overdue, 1);
  assert.equal(result.summary.blocked, 1);
});
