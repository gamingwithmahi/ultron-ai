"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const memory = require("../lib/memory-records");

test("memory validation accepts safe content and normalizes metadata", () => {
  const result = memory.validateMemoryInput({
    content: "  Prefers concise project updates  ",
    category: "preference",
    title: "  Communication  ",
    context: "  Useful working preference  ",
    source: "operator",
    importance: "high",
    tags: ["Work", "work", "Project Delivery", "valid_tag"],
    pinned: true
  });
  assert.equal(result.value.content, "Prefers concise project updates");
  assert.equal(result.value.title, "Communication");
  assert.equal(result.value.pinned, true);
  assert.deepEqual(result.value.tags, ["work", "project delivery", "valid_tag"]);
});

test("memory validation rejects missing, oversized, and sensitive content", () => {
  for (const content of ["x", "x".repeat(2001), "password: abc123", "My API key = abc123", "refresh_token: abc"]) {
    assert.ok(memory.validateMemoryInput({ content, category: "fact" }).error);
  }
});

test("memory validation rejects invalid categories, sources, importance, and pinned types", () => {
  const base = { content: "A safe memory", category: "fact" };
  assert.match(memory.validateMemoryInput({ ...base, category: "secret" }).error, /category/i);
  assert.match(memory.validateMemoryInput({ ...base, source: "unknown" }).error, /source/i);
  assert.match(memory.validateMemoryInput({ ...base, importance: "urgent" }).error, /importance/i);
  assert.match(memory.validateMemoryInput({ ...base, pinned: "yes" }).error, /pinned/i);
});

test("partial memory updates validate only supplied fields", () => {
  const result = memory.validateMemoryInput({ pinned: true, tags: "Project, Review" }, { partial: true });
  assert.deepEqual(result.value, { tags: ["project", "review"], pinned: true });
  assert.match(memory.validateMemoryInput({ content: "api_key=exposed" }, { partial: true }).error, /Do not save/i);
});

test("memory statistics count categories and importance without exposing memory contents", () => {
  const result = memory.buildMemoryStats([
    { category: "fact", pinned: true, importance: "critical", updatedAt: "2026-11-28T00:00:00.000Z" },
    { category: "project", pinned: false, importance: "normal", createdAt: "2026-11-27T00:00:00.000Z" },
    { category: "fact", pinned: false, importance: "high", createdAt: "2026-11-26T00:00:00.000Z" }
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.pinned, 1);
  assert.equal(result.highImportance, 2);
  assert.deepEqual(result.byCategory, { fact: 2, project: 1 });
  assert.equal(result.latestUpdatedAt, "2026-11-28T00:00:00.000Z");
  assert.equal(Object.hasOwn(result, "content"), false);
});
