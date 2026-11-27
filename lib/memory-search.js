"use strict";

const CATEGORIES = new Set(["preference", "project", "fact", "reminder"]);

function tokenize(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu) || [];
}

function searchMemories(memories, options = {}) {
  const query = String(options.query || "").trim().slice(0, 160);
  const category = options.category && options.category !== "all" ? String(options.category) : "all";
  const limit = Math.min(50, Math.max(1, Number.parseInt(options.limit, 10) || 20));
  const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
  const from = options.from ? Date.parse(options.from) : null;
  const to = options.to ? Date.parse(options.to) : null;
  if (category !== "all" && !CATEGORIES.has(category)) return { error: "Invalid memory category" };
  if (options.from && !Number.isFinite(from)) return { error: "Invalid start date" };
  if (options.to && !Number.isFinite(to)) return { error: "Invalid end date" };
  if (Number.isFinite(from) && Number.isFinite(to) && from > to) return { error: "Start date must be before end date" };

  const terms = [...new Set(tokenize(query))];
  const results = (Array.isArray(memories) ? memories : []).filter(item => {
    if (category !== "all" && item.category !== category) return false;
    const created = Date.parse(item.createdAt || "");
    if (Number.isFinite(from) && (!Number.isFinite(created) || created < from)) return false;
    if (Number.isFinite(to) && (!Number.isFinite(created) || created > to + 86400000 - 1)) return false;
    return true;
  }).map(item => {
    const haystack = (String(item.content || "") + " " + String(item.category || "")).toLocaleLowerCase().normalize("NFKC");
    const matched = terms.filter(term => haystack.includes(term));
    return { item, score: terms.length ? matched.length / terms.length : 1, matchedTerms: matched.length };
  }).filter(result => !terms.length || result.matchedTerms > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.item.createdAt || 0) - Date.parse(a.item.createdAt || 0));
  return {
    query, category, total: results.length, limit, offset,
    hasMore: offset + limit < results.length,
    memories: results.slice(offset, offset + limit).map(({ item, score }) => ({ ...item, relevance: Number(score.toFixed(2)) }))
  };
}

module.exports = { CATEGORIES, tokenize, searchMemories };
