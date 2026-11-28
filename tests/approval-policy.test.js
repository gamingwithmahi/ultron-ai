"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_TTL_MS,
  ACTION_TYPES,
  RISKS,
  validateApprovalRequest,
  isExpired,
  expirePendingApprovals
} = require("../lib/approval-policy");

test("approval request accepts valid values and trims user text", () => {
  const result = validateApprovalRequest({
    title: "  Review external action  ",
    details: "  Send a draft only after operator confirmation.  ",
    actionType: "send_message",
    risk: "medium"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    title: "Review external action",
    details: "Send a draft only after operator confirmation.",
    actionType: "send_message",
    risk: "medium"
  });
});

test("approval request rejects titles outside the allowed length", () => {
  for (const title of ["x".repeat(2), "x".repeat(101)]) {
    const result = validateApprovalRequest({
      title,
      details: "Valid details",
      actionType: "other",
      risk: "low"
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Title/);
  }
});

test("approval request rejects details outside the allowed length", () => {
  for (const details of ["x".repeat(2), "x".repeat(1001)]) {
    const result = validateApprovalRequest({
      title: "Valid title",
      details,
      actionType: "other",
      risk: "low"
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Details/);
  }
});

test("approval request accepts only declared action types and risk levels", () => {
  assert.ok(ACTION_TYPES.includes("financial_action"));
  assert.ok(RISKS.includes("critical"));

  for (const [actionType, risk] of [
    ["run_shell", "low"],
    ["other", "unbounded"],
    ["", ""]
  ]) {
    const result = validateApprovalRequest({
      title: "Valid title",
      details: "Valid details",
      actionType,
      risk
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /action type or risk/);
  }
});

test("only pending approvals can expire", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isExpired({
    status: "pending",
    createdAt: new Date(now - DEFAULT_TTL_MS - 1).toISOString()
  }, now), true);

  for (const status of ["approved", "rejected", "expired", "executed"]) {
    assert.equal(isExpired({
      status,
      createdAt: new Date(now - DEFAULT_TTL_MS - 1).toISOString()
    }, now), false);
  }
});

test("explicit expiry timestamp takes precedence over the default TTL", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const item = {
    status: "pending",
    createdAt: new Date(now - DEFAULT_TTL_MS * 2).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  };
  assert.equal(isExpired(item, now), false);
  item.expiresAt = new Date(now - 1).toISOString();
  assert.equal(isExpired(item, now), true);
});

test("expiry transition marks only overdue pending approvals and is idempotent", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const items = [
    { id: "overdue", status: "pending", createdAt: new Date(now - DEFAULT_TTL_MS - 1).toISOString() },
    { id: "fresh", status: "pending", createdAt: new Date(now - 1000).toISOString() },
    { id: "approved", status: "approved", createdAt: new Date(now - DEFAULT_TTL_MS * 2).toISOString() }
  ];

  const expired = expirePendingApprovals(items, now);
  assert.deepEqual(expired.map(item => item.id), ["overdue"]);
  assert.equal(items[0].status, "expired");
  assert.equal(items[0].expiredAt, new Date(now).toISOString());
  assert.equal(items[1].status, "pending");
  assert.equal(items[2].status, "approved");
  assert.deepEqual(expirePendingApprovals(items, now), []);
});

test("expiry handles absent or malformed date values without expiring them", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isExpired({ status: "pending" }, now), false);
  assert.equal(isExpired({ status: "pending", createdAt: "not-a-date", expiresAt: "also-invalid" }, now), false);
});


test("approval policy rejects null and non-object request bodies safely", () => {
  for (const input of [null, undefined, "not-an-object", 42]) {
    const result = validateApprovalRequest(input);
    assert.equal(result.ok, false);
    assert.match(result.error, /Title/);
  }
});

test("approval expiry helpers safely ignore malformed collection entries", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isExpired(null, now), false);
  assert.deepEqual(expirePendingApprovals(null, now), []);
  assert.deepEqual(expirePendingApprovals({ status: "pending" }, now), []);
  assert.deepEqual(expirePendingApprovals([null, {}, { status: "approved" }], now), []);
});


test("new approval records are bound to immutable request details and never execute actions", () => {
  const now = new Date("2026-11-28T12:00:00.000Z");
  const created = require("../lib/approval-policy").createApprovalRecord({
    title: "Send customer reply",
    details: "Send the exact reviewed message to the named recipient.",
    actionType: "send_message",
    risk: "high"
  }, now);
  assert.equal(created.ok, true);
  const item = created.value;
  assert.equal(item.policyVersion, 2);
  assert.equal(item.executionEnabled, false);
  assert.equal(item.executionStatus, "not_executed");
  assert.equal(item.expiresAt, new Date(now.getTime() + DEFAULT_TTL_MS).toISOString());
  const reviewed = require("../lib/approval-policy").reviewApproval(item, "approved", now);
  assert.equal(reviewed.ok, true);
  assert.equal(item.status, "approved");
  assert.equal(item.executionEnabled, false);
  assert.equal(item.executionStatus, "not_executed");
  assert.equal(item.approvedAt, now.toISOString());
});

test("approval review fails closed if reviewed action details were altered", () => {
  const { createApprovalRecord, reviewApproval } = require("../lib/approval-policy");
  const item = createApprovalRecord({
    title: "Transfer funds",
    details: "Transfer exactly the reviewed amount to the reviewed destination.",
    actionType: "financial_action",
    risk: "critical"
  }).value;
  item.details = "Transfer a different amount to a different destination.";
  const result = reviewApproval(item, "approved");
  assert.equal(result.ok, false);
  assert.match(result.error, /integrity check failed/i);
  assert.equal(item.status, "pending");
  assert.equal(item.executionEnabled, false);
});

test("approval review rejects repeat decisions and expires stale requests", () => {
  const { createApprovalRecord, reviewApproval } = require("../lib/approval-policy");
  const now = new Date("2026-11-28T12:00:00.000Z");
  const item = createApprovalRecord({
    title: "Publish a post",
    details: "Publish only the exact approved post.",
    actionType: "publish_content",
    risk: "high"
  }, now).value;
  assert.equal(reviewApproval(item, "rejected", now).ok, true);
  assert.equal(reviewApproval(item, "approved", now).ok, false);
  const expired = createApprovalRecord({
    title: "Delete a file",
    details: "Delete only the exact named file.",
    actionType: "delete_data",
    risk: "critical"
  }, now).value;
  const staleTime = new Date(now.getTime() + DEFAULT_TTL_MS + 1);
  const result = reviewApproval(expired, "approved", staleTime);
  assert.equal(result.ok, false);
  assert.equal(expired.status, "expired");
});
