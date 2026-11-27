"use strict";

const SOURCES = new Set(["operator","meeting","email","research","project","import"]);
const IMPORTANCE = new Set(["normal","high","critical"]);
const TAG_PATTERN = /^[\\p{L}\\p{N}_ -]{1,24}$/u;
const SENSITIVE_PATTERN = /(?:password|passphrase|otp|one[- ]time code|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|private[_ -]?key)\\s*[:=]/i;

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().replace(/\\s+/g, " ").slice(0, max) : "";
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tags = [];
  for (const raw of list.slice(0, 16)) {
    const tag = cleanText(String(raw), 24).toLocaleLowerCase();
    if (tag && TAG_PATTERN.test(tag) && !tags.includes(tag)) tags.push(tag);
    if (tags.length === 8) break;
  }
  return tags;
}

function validateMemoryInput(input, { partial = false } = {}) {
  const data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const result = {};
  if (!partial || Object.hasOwn(data, "content")) {
    if (typeof data.content !== "string" || data.content.trim().length < 2 || data.content.length > 2000) return { error: "Memory must be 2–2000 characters" };
    if (SENSITIVE_PATTERN.test(data.content)) return { error: "Do not save passwords, tokens, API keys, or OTPs in memory" };
    result.content = data.content.trim();
  }
  if (!partial || Object.hasOwn(data, "category")) {
    if (!["preference","project","fact","reminder"].includes(data.category)) return { error: "Invalid memory category" };
    result.category = data.category;
  }
  for (const [field,max] of [["title",100],["context",600],["sourceRef",120]]) {
    if (!partial || Object.hasOwn(data, field)) {
      if (data[field] !== undefined && typeof data[field] !== "string") return { error: "Invalid " + field };
      result[field] = cleanText(data[field] || "", max);
    }
  }
  if (!partial || Object.hasOwn(data, "source")) {
    const source = data.source || "operator";
    if (!SOURCES.has(source)) return { error: "Invalid memory source" };
    result.source = source;
  }
  if (!partial || Object.hasOwn(data, "importance")) {
    const importance = data.importance || "normal";
    if (!IMPORTANCE.has(importance)) return { error: "Invalid memory importance" };
    result.importance = importance;
  }
  if (!partial || Object.hasOwn(data, "tags")) result.tags = normalizeTags(data.tags);
  if (!partial || Object.hasOwn(data, "pinned")) {
    if (data.pinned !== undefined && typeof data.pinned !== "boolean") return { error: "Pinned must be true or false" };
    result.pinned = data.pinned === true;
  }
  return { value: result };
}

function buildMemoryStats(memories) {
  const items = Array.isArray(memories) ? memories : [];
  const byCategory = {};
  for (const item of items) byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  return {
    total: items.length,
    pinned: items.filter(item => item.pinned).length,
    highImportance: items.filter(item => ["high","critical"].includes(item.importance)).length,
    byCategory,
    latestUpdatedAt: items.reduce((latest,item) => !latest || Date.parse(item.updatedAt || item.createdAt) > Date.parse(latest) ? (item.updatedAt || item.createdAt) : latest, null)
  };
}

module.exports = { SOURCES, IMPORTANCE, normalizeTags, validateMemoryInput, buildMemoryStats };
