"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyInboxItem, getCalendarConflicts, rankFocusTasks, buildIntelligenceSnapshot } = require("../lib/intelligence");

test("inbox classifier flags security and urgent messages without executing actions", () => {
  const security = classifyInboxItem({ subject: "Suspicious sign-in", snippet: "Verify your account" });
  assert.equal(security.category, "security");
  assert.equal(security.needsAttention, true);
  assert.equal(classifyInboxItem({ subject: "Weekly newsletter" }).category, "updates");
  assert.equal(classifyInboxItem({ subject: "Hello" }).category, "general");
});

test("calendar conflict detector finds overlapping timed events and ignores all-day dates", () => {
  const events = [
    { id: "a", summary: "Standup", start: "2026-11-28T10:00:00+06:00", end: "2026-11-28T10:30:00+06:00" },
    { id: "b", summary: "Client call", start: "2026-11-28T10:15:00+06:00", end: "2026-11-28T11:00:00+06:00" },
    { id: "c", summary: "Holiday", start: "2026-11-29", end: "2026-11-30" }
  ];
  const conflicts = getCalendarConflicts(events);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overlapMinutes, 15);
  assert.equal(conflicts[0].first.id, "a");
});

test("calendar conflict detector allows adjacent events", () => {
  const events = [
    { id: "a", start: "2026-11-28T10:00:00Z", end: "2026-11-28T10:30:00Z" },
    { id: "b", start: "2026-11-28T10:30:00Z", end: "2026-11-28T11:00:00Z" }
  ];
  assert.equal(getCalendarConflicts(events).length, 0);
});

test("focus queue ranks high priority and in-progress tasks first", () => {
  const now = new Date("2026-11-28T00:00:00Z");
  const result = rankFocusTasks([
    { id: "low", title: "Low", priority: "low", status: "queued", createdAt: now.toISOString() },
    { id: "high", title: "High", priority: "high", status: "queued", createdAt: now.toISOString() },
    { id: "working", title: "Working", priority: "normal", status: "in_progress", createdAt: now.toISOString() },
    { id: "done", title: "Done", priority: "high", status: "completed", createdAt: now.toISOString() }
  ], [{ status: "pending" }], now);
  assert.deepEqual(result.tasks.map(x => x.id), ["high", "working", "low"]);
  assert.equal(result.pendingApprovals, 1);
});

test("intelligence snapshot reports insights but never enables external actions", () => {
  const snapshot = buildIntelligenceSnapshot({
    gmail: { connected: true, items: [{ subject: "Urgent action required", snippet: "Please review" }] },
    calendar: { connected: true, items: [
      { id: "1", summary: "A", start: "2026-11-28T10:00:00Z", end: "2026-11-28T11:00:00Z" },
      { id: "2", summary: "B", start: "2026-11-28T10:30:00Z", end: "2026-11-28T11:30:00Z" }
    ] },
    tasks: [{ id: "t", title: "Ship release", priority: "high", status: "queued", createdAt: "2026-11-27T00:00:00Z" }],
    approvals: [{ status: "pending" }],
    now: new Date("2026-11-28T00:00:00Z")
  });
  assert.equal(snapshot.summary.inboxNeedsAttention, 1);
  assert.equal(snapshot.summary.calendarConflicts, 1);
  assert.equal(snapshot.summary.activeTasks, 1);
  assert.equal(snapshot.safety.externalActionsEnabled, false);
  assert.equal(snapshot.safety.emailModified, false);
  assert.equal(snapshot.safety.calendarModified, false);
});
