"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const focus = require("../lib/focus-sessions");

test("focus session validates title, duration, and linked task", () => {
  assert.match(focus.createSession({ title: "x" }).error, /title/i);
  assert.match(focus.createSession({ title: "Deep work", targetMinutes: 4 }).error, /duration/i);
  assert.match(focus.createSession({ title: "Deep work", taskId: "missing" }).error, /active task/i);
  const result = focus.createSession(
    { title: "  Deep work  ", targetMinutes: 45, taskId: "task-1", notes: "  No distractions  " },
    [{ id: "task-1", status: "in_progress" }],
    new Date("2026-11-28T00:00:00.000Z")
  );
  assert.equal(result.value.title, "Deep work");
  assert.equal(result.value.targetMinutes, 45);
  assert.equal(result.value.notes, "No distractions");
  assert.equal(result.value.status, "running");
});

test("focus session pause and resume preserve accumulated elapsed time", () => {
  const start = new Date("2026-11-28T00:00:00.000Z");
  const created = focus.createSession({ title: "Build ULTRON" }, [], start).value;
  const paused = focus.transitionSession(created, "pause", new Date(start.getTime() + 125000)).value;
  assert.equal(paused.status, "paused");
  assert.equal(paused.elapsedSeconds, 125);
  assert.equal(paused.segments[0].endedAt, new Date(start.getTime() + 125000).toISOString());

  const resumed = focus.transitionSession(paused, "resume", new Date(start.getTime() + 300000)).value;
  assert.equal(resumed.status, "running");
  assert.equal(resumed.elapsedSeconds, 125);
  assert.equal(resumed.segments.length, 2);
  assert.equal(resumed.segments[1].endedAt, null);

  const presented = focus.presentSession(resumed, new Date(start.getTime() + 360000));
  assert.equal(presented.elapsedSeconds, 185);
  assert.equal(presented.remainingSeconds, 25 * 60 - 185);
});

test("focus session cannot be paused twice or resumed while running", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const running = focus.createSession({ title: "Focused work" }, [], now).value;
  assert.match(focus.transitionSession(running, "resume", now).error, /not paused/i);
  const paused = focus.transitionSession(running, "pause", now).value;
  assert.match(focus.transitionSession(paused, "pause", now).error, /not running/i);
  assert.match(focus.transitionSession(null, "pause", now).error, /not found/i);
  assert.match(focus.transitionSession(running, "delete", now).error, /unsupported/i);
});

test("completed and cancelled focus sessions are finalized and tracked", () => {
  const start = new Date("2026-11-28T00:00:00.000Z");
  const running = focus.createSession({ title: "Complete task", targetMinutes: 5 }, [], start).value;
  const completed = focus.transitionSession(running, "complete", new Date(start.getTime() + 300000)).value;
  assert.equal(completed.status, "completed");
  assert.equal(completed.elapsedSeconds, 300);
  assert.ok(completed.completedAt);
  assert.match(focus.transitionSession(completed, "cancel", new Date()).error, /finalized/i);

  const other = focus.createSession({ title: "Cancel task" }, [], start).value;
  const cancelled = focus.transitionSession(other, "cancel", new Date(start.getTime() + 60000)).value;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.elapsedSeconds, 60);
  assert.ok(cancelled.cancelledAt);
});

test("focus summary reports totals, today's work, and recent daily activity", () => {
  const now = new Date("2026-11-28T12:00:00.000Z");
  const sessions = [
    { id: "a", status: "completed", elapsedSeconds: 3600, createdAt: "2026-11-28T08:00:00.000Z", completedAt: "2026-11-28T09:00:00.000Z", targetMinutes: 60 },
    { id: "b", status: "paused", elapsedSeconds: 900, createdAt: "2026-11-28T10:00:00.000Z", targetMinutes: 25 },
    { id: "c", status: "completed", elapsedSeconds: 1800, createdAt: "2026-11-27T08:00:00.000Z", completedAt: "2026-11-27T08:30:00.000Z", targetMinutes: 30 }
  ];
  const result = focus.summarizeSessions(sessions, now);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.completed, 2);
  assert.equal(result.summary.paused, 1);
  assert.equal(result.summary.todaySessions, 2);
  assert.equal(result.summary.todayMinutes, 75);
  assert.equal(result.summary.totalMinutes, 105);
  assert.equal(result.summary.averageCompletedMinutes, 45);
  assert.ok(result.daily.some(item => item.date === "2026-11-28"));
});
