"use strict";

const CATEGORIES = new Set(["preference", "project", "fact", "reminder"]);
const STOP_WORDS = new Set(["what","is","the","a","an","of","to","for","and","or","in","on","my","me","you","your","do","does","can","could","would","please","tell","about","how","when","where","why","who","which","this","that","it","i","we","our","with","from","be","are","was","were","have","has","had","আমার","কি","কী","হলো","হয়","করে","দাও","বল","দেখাও","এবং","এর","জন্য","একটা","এই","সেই","তুমি","আমি","তোমার","কেমন","কখন","কোথায়"]);

function tokenize(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu) || [];
}

function searchMemories(memories, options = {}) {
  const query = String(options.query || "").trim().slice(0, 160);
  const category = options.category && options.category !== "all" ? String(options.category) : "all";
  const pinned = options.pinned === "true" || options.pinned === true ? true : options.pinned === "false" ? false : null;
  const limit = Math.min(50, Math.max(1, Number.parseInt(options.limit, 10) || 20));
  const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
  const from = options.from ? Date.parse(options.from) : null;
  const to = options.to ? Date.parse(options.to) : null;
  if (category !== "all" && !CATEGORIES.has(category)) return { error: "Invalid memory category" };
  if (options.from && !Number.isFinite(from)) return { error: "Invalid start date" };
  if (options.to && !Number.isFinite(to)) return { error: "Invalid end date" };
  if (Number.isFinite(from) && Number.isFinite(to) && from > to) return { error: "Start date must be before end date" };

  const terms = [...new Set(tokenize(query).filter(term => !STOP_WORDS.has(term)))];
  const results = (Array.isArray(memories) ? memories : []).filter(item => {
    if (category !== "all" && item.category !== category) return false;
    if (pinned !== null && (item.pinned === true) !== pinned) return false;
    const created = Date.parse(item.createdAt || "");
    if (Number.isFinite(from) && (!Number.isFinite(created) || created < from)) return false;
    if (Number.isFinite(to) && (!Number.isFinite(created) || created > to + 86400000 - 1)) return false;
    return true;
  }).map(item => {
    const fields = { title:String(item.title || ""), content:String(item.content || ""), context:String(item.context || ""), tags:Array.isArray(item.tags) ? item.tags.join(" ") : "", category:String(item.category || "") };
    const normalized = Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,value.toLocaleLowerCase().normalize("NFKC")]));
    const matched = terms.filter(term => Object.values(normalized).some(value => value.includes(term)));
    const weighted = terms.reduce((sum,term) => sum + (normalized.title.includes(term)?3:0) + (normalized.tags.includes(term)?2:0) + (normalized.content.includes(term)?1:0) + (normalized.context.includes(term)?0.75:0) + (normalized.category.includes(term)?0.5:0),0);
    const score = terms.length ? weighted / (terms.length * 7.25) : 0;
    return { item, score: Math.min(1, score + (item.pinned ? 0.05 : 0) + (item.importance === "critical" ? 0.04 : item.importance === "high" ? 0.02 : 0)), matchedTerms: matched.length };
  }).filter(result => !terms.length || result.matchedTerms > 0)
    .sort((a, b) => Number(!!b.item.pinned) - Number(!!a.item.pinned) || b.score - a.score || Date.parse(b.item.updatedAt || b.item.createdAt || 0) - Date.parse(a.item.updatedAt || a.item.createdAt || 0));
  return {
    query, category, pinned, total: results.length, limit, offset,
    hasMore: offset + limit < results.length,
    memories: results.slice(offset, offset + limit).map(({ item, score }) => ({ ...item, relevance: Number(score.toFixed(2)) }))
  };
}

module.exports = { CATEGORIES, tokenize, searchMemories };
