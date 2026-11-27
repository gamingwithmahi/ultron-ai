"use strict";

const RULES = [
  { category: "security", priority: 5, words: ["security alert", "suspicious sign-in", "password reset", "verify your account", "unusual activity", "compromised"] },
  { category: "urgent", priority: 5, words: ["urgent", "asap", "immediately", "deadline today", "action required", "overdue"] },
  { category: "finance", priority: 4, words: ["invoice", "payment", "receipt", "billing", "refund", "subscription renewal"] },
  { category: "action", priority: 4, words: ["please review", "approval needed", "please respond", "follow up", "meeting request", "your response"] },
  { category: "updates", priority: 2, words: ["newsletter", "weekly digest", "product update", "release notes", "announcement"] }
];

function classifyInboxItem(item) {
  const text = [item.subject, item.from, item.snippet].filter(Boolean).join(" ").toLowerCase();
  const rule = RULES.find(candidate => candidate.words.some(word => text.includes(word)));
  return {
    ...item,
    category: rule ? rule.category : "general",
    priority: rule ? rule.priority : 3,
    needsAttention: !!rule && rule.priority >= 4
  };
}

function getCalendarConflicts(events) {
  const timed = (events || []).filter(event => !(typeof event.start === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(event.start)) && !(typeof event.end === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(event.end))).map(event => ({
    ...event,
    startMs: Date.parse(event.start || ""),
    endMs: Date.parse(event.end || "")
  })).filter(event => Number.isFinite(event.startMs) && Number.isFinite(event.endMs) && event.endMs > event.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const conflicts = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].startMs < timed[i].endMs; j++) {
      if (timed[i].startMs < timed[j].endMs && timed[j].startMs < timed[i].endMs) {
        conflicts.push({
          first: { id: timed[i].id, summary: timed[i].summary, start: timed[i].start, end: timed[i].end },
          second: { id: timed[j].id, summary: timed[j].summary, start: timed[j].start, end: timed[j].end },
          overlapMinutes: Math.max(1, Math.round((Math.min(timed[i].endMs, timed[j].endMs) - Math.max(timed[i].startMs, timed[j].startMs)) / 60000))
        });
      }
    }
  }
  return conflicts;
}

function rankFocusTasks(tasks, approvals, now = new Date()) {
  const active = (tasks || []).filter(task => ["queued", "in_progress"].includes(task.status));
  const ranked = active.map(task => {
    const createdMs = Date.parse(task.createdAt || now.toISOString());\n    const ageHours = Number.isFinite(createdMs) ? Math.max(0, (now.getTime() - createdMs) / 3600000) : 0;
    const score = (task.priority === "high" ? 40 : task.priority === "normal" ? 20 : 10) +
      (task.status === "in_progress" ? 15 : 0) + Math.min(10, Math.floor(ageHours / 24));
    return { id: task.id, title: task.title, status: task.status, priority: task.priority, score };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
  const pendingApprovals = (approvals || []).filter(item => item.status === "pending").length;
  return { tasks: ranked, pendingApprovals, activeTasks: active.length };
}

function buildIntelligenceSnapshot({ gmail, calendar, tasks, approvals, now = new Date() }) {
  const inbox = (gmail && gmail.items || []).map(classifyInboxItem).sort((a, b) => b.priority - a.priority);
  const conflicts = getCalendarConflicts(calendar && calendar.items || []);
  const focus = rankFocusTasks(tasks, approvals, now);
  const attention = inbox.filter(item => item.needsAttention);
  const insights = [];
  if (attention.length) insights.push({ type: "inbox", severity: "warning", title: attention.length + " inbox item(s) may need attention", detail: "Review high-priority and action-oriented messages. ULTRON has not changed your inbox." });
  if (conflicts.length) insights.push({ type: "calendar", severity: "warning", title: conflicts.length + " calendar overlap(s) detected", detail: "Review the conflicting event times. ULTRON has not modified your calendar." });
  if (focus.pendingApprovals) insights.push({ type: "approval", severity: "info", title: focus.pendingApprovals + " approval request(s) awaiting review", detail: "Approval records do not execute external actions." });
  if (focus.activeTasks) insights.push({ type: "tasks", severity: "info", title: focus.activeTasks + " active task(s) in your queue", detail: "The focus list is ranked by priority, status, and age." });
  if (!insights.length) insights.push({ type: "system", severity: "success", title: "No urgent signals in the available data", detail: "Connect Google services and add tasks to receive a richer intelligence snapshot." });
  return {
    generatedAt: now.toISOString(),
    mode: "rules_based_read_only",
    summary: {
      inboxMessages: inbox.length,
      inboxNeedsAttention: attention.length,
      calendarEvents: (calendar && calendar.items || []).length,
      calendarConflicts: conflicts.length,
      activeTasks: focus.activeTasks,
      pendingApprovals: focus.pendingApprovals
    },
    inbox: inbox.slice(0, 10),
    calendarConflicts: conflicts.slice(0, 10),
    focusQueue: focus.tasks,
    insights,
    integrations: { gmail: !!(gmail && gmail.connected), calendar: !!(calendar && calendar.connected) },
    safety: { externalActionsEnabled: false, emailModified: false, calendarModified: false, generatedBy: "deterministic_rules" }
  };
}

module.exports = { classifyInboxItem, getCalendarConflicts, rankFocusTasks, buildIntelligenceSnapshot };
