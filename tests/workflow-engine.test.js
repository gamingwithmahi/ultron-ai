"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../lib/workflow-engine");

test("reminder creation validates date and recurrence and normalizes timezone", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  assert.match(engine.createReminder({ title: "x", dueAt: now.toISOString() }, now).error, /title/i);
  assert.match(engine.createReminder({ title: "Call client", dueAt: "invalid" }, now).error, /valid reminder/i);
  assert.match(engine.createReminder({ title: "Call client", dueAt: now.toISOString(), recurrence: "hourly" }, now).error, /recurrence/i);
  const result = engine.createReminder({ title: "  Call client  ", dueAt: "2026-11-29T09:00:00+06:00", recurrence: "weekly" }, now);
  assert.equal(result.value.title, "Call client");
  assert.equal(result.value.timezone, "Asia/Dhaka");
  assert.equal(result.value.dueAt, "2026-11-29T03:00:00.000Z");
});

test("reminder summary identifies overdue, due-soon, and completed items", () => {
  const now = new Date("2026-11-28T12:00:00.000Z");
  const result = engine.summarizeReminders([
    { id: "late", status: "active", dueAt: "2026-11-28T10:00:00.000Z" },
    { id: "soon", status: "active", dueAt: "2026-11-29T10:00:00.000Z" },
    { id: "done", status: "completed", dueAt: "2026-11-28T11:00:00.000Z" }
  ], now);
  assert.equal(result.summary.active, 2);
  assert.equal(result.summary.overdue, 1);
  assert.equal(result.summary.dueSoon, 1);
  assert.equal(result.summary.completed, 1);
  assert.equal(result.items[0].id, "late");
});

test("workflow templates create operator checklists with external actions disabled", () => {
  assert.match(engine.createWorkflow({ template: "unknown" }).error, /supported workflow/i);
  const result = engine.createWorkflow({ template: "daily_briefing" }, new Date("2026-11-28T00:00:00.000Z"));
  assert.equal(result.value.steps.length, 5);
  assert.equal(result.value.executionMode, "operator_checklist");
  assert.equal(result.value.externalActionsEnabled, false);
  assert.equal(result.value.status, "active");
});

test("workflow enforces sequential steps and completes only after all steps are resolved", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const workflow = engine.createWorkflow({ template: "project_launch" }, now).value;
  assert.match(engine.updateWorkflowStep(workflow, "2", "completed", now).error, /earlier steps/i);
  assert.equal(engine.updateWorkflowStep(workflow, "1", "completed", now).value.currentStep, 1);
  assert.equal(engine.updateWorkflowStep(workflow, "2", "in_progress", now).value.currentStep, 1);
  assert.equal(engine.updateWorkflowStep(workflow, "2", "completed", now).value.currentStep, 2);
  for (const step of workflow.steps.slice(2)) {
    const result = engine.updateWorkflowStep(workflow, step.id, "skipped", now);
    assert.ok(result.value);
  }
  assert.equal(workflow.status, "completed");
  assert.ok(workflow.completedAt);
});

test("workflow pause and cancel transitions never enable external execution", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const workflow = engine.createWorkflow({ template: "weekly_review" }, now).value;
  assert.equal(engine.setWorkflowStatus(workflow, "paused", now).value.status, "paused");
  assert.match(engine.updateWorkflowStep(workflow, "1", "completed", now).error, /active workflows/i);
  assert.equal(engine.setWorkflowStatus(workflow, "active", now).value.status, "active");
  assert.equal(engine.setWorkflowStatus(workflow, "cancelled", now).value.status, "cancelled");
  assert.equal(workflow.externalActionsEnabled, false);
  assert.match(engine.setWorkflowStatus(workflow, "completed", now).error, /invalid workflow status/i);
});

test("operations snapshot summarizes tasks and workflows without external actions", () => {
  const result = engine.buildOperationsSnapshot({
    reminders: [{ status: "active", dueAt: "2026-11-28T10:00:00.000Z" }],
    workflows: [{ status: "active", steps: [{ status: "pending" }, { status: "completed" }] }],
    tasks: [{ status: "queued", priority: "high" }],
    now: new Date("2026-11-28T12:00:00.000Z")
  });
  assert.equal(result.timezone, "Asia/Dhaka");
  assert.equal(result.reminders.overdue, 1);
  assert.equal(result.workflows.active, 1);
  assert.equal(result.workflows.stepsRemaining, 1);
  assert.equal(result.tasks.highPriority, 1);
  assert.equal(result.externalActionsEnabled, false);
});
