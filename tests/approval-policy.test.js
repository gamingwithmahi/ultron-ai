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
