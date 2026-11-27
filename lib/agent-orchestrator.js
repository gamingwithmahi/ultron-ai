"use strict";

const DEFINITIONS = [
  { id:"personal", name:"Personal Assistant Agent", category:"Core", domain:"Personal productivity", mode:"chat_only", status:"provider_required", capabilities:["Natural-language assistance","Task and decision support"], permissions:["Authenticated operator"], permissionLevel:"read_and_draft", requiresApproval:["External actions"], guardrail:"Conversation and recommendations only; no external actions." },
  { id:"youtube", name:"YouTube Management Agent", category:"Creator", domain:"Channel intelligence", mode:"planned", status:"planned", capabilities:["Channel analytics roadmap","SEO and content planning","Audience and competitor research"], permissions:["Official YouTube OAuth not connected"], permissionLevel:"read_only_when_connected", requiresApproval:["Publish","Delete","Channel settings"], guardrail:"No YouTube account is connected; publishing and channel changes are disabled." },
  { id:"meeting", name:"Meeting & Attendance Agent", category:"Productivity", domain:"Meetings", mode:"planned", status:"planned", capabilities:["Meeting preparation","Notes and action-item templates"], permissions:["No meeting provider or recording integration"], permissionLevel:"draft_only", requiresApproval:["Join meetings","Recording","Sharing transcripts"], guardrail:"No meeting attendance or recording is active; consent is required before recording." },
  { id:"memory", name:"Notes & Memory Agent", category:"Core", domain:"Personal knowledge", mode:"operator_controlled", status:"available", capabilities:["Save and search operator memories","Filter by category and date","Delete individual records"], permissions:["Authenticated operator only"], permissionLevel:"read_write_operator", requiresApproval:["Permanent deletion"], guardrail:"No automatic collection; never store passwords, OTPs, or API secrets." },
  { id:"phone", name:"Phone & Communication Agent", category:"Device", domain:"Android and calls", mode:"planned", status:"planned", capabilities:["Call workflow design","Missed-call and follow-up planning"], permissions:["No device bridge or telephony provider"], permissionLevel:"planned", requiresApproval:["Call answer/reject/transfer","Recording"], guardrail:"Cannot access calls, contacts, microphone, or device functions." },
  { id:"whatsapp", name:"WhatsApp Management Agent", category:"Communications", domain:"Messaging", mode:"official_api_only", status:"official_api_required", capabilities:["Message classification design","Reply drafting workflow"], permissions:["Official Meta WhatsApp Business Cloud API required"], permissionLevel:"draft_only", requiresApproval:["Sending messages","Sensitive replies"], guardrail:"No unofficial WhatsApp automation or message sending." },
  { id:"gmail", name:"Gmail & Email Management Agent", category:"Communications", domain:"Email", mode:"read_only", status:"connect_required", capabilities:["Read message metadata","Inbox priority and summary","Draft planning"], permissions:["Gmail read-only OAuth scope"], permissionLevel:"read_only", requiresApproval:["Any email send or modification"], guardrail:"Read-only integration; cannot send, delete, label, or modify messages." },
  { id:"financial", name:"Financial & Stock Analysis Agent", category:"Finance", domain:"Market research", mode:"research_only", status:"data_provider_required", capabilities:["Market analysis framework","Technical and fundamental analysis templates","Risk scenario reporting"], permissions:["No market-data provider connected"], permissionLevel:"research_only", requiresApproval:["Financial transactions"], guardrail:"No verified live prices until a data provider is configured; no investment guarantees." },
  { id:"trading", name:"Trading Intelligence Agent", category:"Finance", domain:"Paper trading", mode:"simulation_only", status:"simulation_only", capabilities:["Paper-trading design","Risk and reward calculations"], permissions:["No broker execution permission"], permissionLevel:"simulation_only", requiresApproval:["All real-money trading"], guardrail:"Real-money trading and order execution are disabled." },
  { id:"research", name:"Daily Research Agent", category:"Intelligence", domain:"Verified research", mode:"planned", status:"planned", capabilities:["Research plans","Source-verification workflow"], permissions:["No dedicated research provider configured"], permissionLevel:"read_only_when_built", requiresApproval:["External communication or purchases"], guardrail:"No background web research engine is active in ULTRON yet." },
  { id:"calendar", name:"Calendar & Reminder Agent", category:"Productivity", domain:"Scheduling", mode:"read_only", status:"connect_required", capabilities:["Read upcoming events","Calendar conflict detection","Reminder planning"], permissions:["Google Calendar read-only OAuth scope"], permissionLevel:"read_only", requiresApproval:["Create, edit, or delete calendar events"], guardrail:"Calendar access is read-only; no alarms or push notifications are configured." },
  { id:"security", name:"Security & Privacy Agent", category:"Security", domain:"Governance", mode:"policy_monitor", status:"available", capabilities:["Approval governance","Security posture reporting","Audit review"], permissions:["Authenticated operator; server-side policy checks"], permissionLevel:"read_only_policy", requiresApproval:["Security policy changes","Credential rotation"], guardrail:"Reports controls and enforces existing gates; does not claim threat detection it cannot perform." }
];

function buildAgentRegistry({ connectedServices = [], openAiConfigured = false } = {}) {
  const connected = new Set(connectedServices);
  const agents = DEFINITIONS.map(definition => {
    let status = definition.status;
    if (definition.id === "personal") status = openAiConfigured ? "available" : "provider_required";
    if (definition.id === "gmail" || definition.id === "calendar") status = connected.has(definition.id) ? "connected" : "connect_required";
    return { ...definition, status, canRun: ["available", "connected"].includes(status) };
  });
  return {
    version: "1.6.0",
    centralBrain: { status: "registry_active", execution: "capability_gated", autonomousExternalActions: false },
    agents,
    summary: {
      total: agents.length,
      available: agents.filter(agent => agent.canRun).length,
      operational: agents.filter(agent => agent.canRun).length,
      connected: agents.filter(agent => agent.status === "connected").length,
      planned: agents.filter(agent => ["planned", "official_api_required", "data_provider_required", "provider_required", "connect_required"].includes(agent.status)).length,
      simulationOnly: agents.filter(agent => agent.status === "simulation_only").length
    },
    safety: { externalWritesEnabled: false, approvalRequiredForSensitiveActions: true, realMoneyTradingEnabled: false }
  };
}

function getAgent(agentId, options) {
  return buildAgentRegistry(options).agents.find(agent => agent.id === agentId) || null;
}

module.exports = { DEFINITIONS, buildAgentRegistry, getAgent };
