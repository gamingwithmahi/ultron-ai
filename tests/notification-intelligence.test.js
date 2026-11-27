"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const notifications = require("../lib/notification-intelligence");

test("notification classifier assigns severity by type and security language", () => {
  assert.equal(notifications.classifyNotification({ type: "security" }).severity, 5);
  assert.equal(notifications.classifyNotification({ type: "approval" }).severity, 4);
  assert.equal(notifications.classifyNotification({ type: "task" }).severity, 3);
  assert.equal(notifications.classifyNotification({ type: "system", title: "Suspicious sign-in" }).severity, 5);
  assert.equal(notifications.classifyNotification({ type: "system", title: "Reminder overdue" }).severity, 4);
});

test("notification summary sorts unread high-severity alerts first", () => {
  const result = notifications.summarizeNotifications([
    { id: "read-critical", type: "security", title: "Security event", readAt: "2026-11-28T00:00:00.000Z", createdAt: "2026-11-28T00:00:00.000Z" },
    { id: "unread-low", type: "system", title: "Routine update", createdAt: "2026-11-28T01:00:00.000Z" },
    { id: "unread-critical", type: "security", title: "Failed login", createdAt: "2026-11-28T02:00:00.000Z" }
  ], new Date("2026-11-28T03:00:00.000Z"));
  assert.equal(result.notifications[0].id, "unread-critical");
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.unread, 2);
  assert.equal(result.summary.critical, 2);
  assert.equal(result.notifications.find(item => item.id === "read-critical").unread, false);
});
