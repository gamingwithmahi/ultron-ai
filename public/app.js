const $ = (id) => document.getElementById(id);
const clock = () => {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour12: false });
  $("date").textContent = now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
clock();
setInterval(clock, 1000);

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function prettyTime(value) {
  try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return "just now"; }
}

async function loadDashboard() {
  const started = performance.now();
  try {
    const [healthRes, overviewRes] = await Promise.all([
      fetch("/api/health", { headers: { Accept: "application/json" } }),
      fetch("/api/overview", { headers: { Accept: "application/json" } })
    ]);
    if (!healthRes.ok || !overviewRes.ok) throw new Error("API unavailable");
    const health = await healthRes.json();
    const overview = await overviewRes.json();
    $("connection-label").textContent = "SYSTEM ONLINE";
    $("api-status").textContent = "CONNECTED";
    $("api-status").className = "status-value good";
    $("latency").textContent = Math.round(performance.now() - started) + " ms";
    $("uptime").textContent = health.uptimeSeconds + "s";
    $("last-check").textContent = prettyTime(health.timestamp);
    $("agent-list").innerHTML = overview.agents.map(agent => {
      const stateClass = agent.state === "planned" ? "planned" : agent.state === "simulation" ? "simulation" : "";
      return '<div class="agent-row"><span class="agent-glyph">◈</span><div><b>' + escapeHtml(agent.name) + '</b><small>' + escapeHtml(agent.id) + '</small></div><span class="agent-state ' + stateClass + '">' + escapeHtml(agent.state.toUpperCase()) + '</span></div>';
    }).join("");
    $("activity-list").innerHTML = overview.activity.map(item =>
      '<div class="activity-item"><i></i><div><b>' + escapeHtml(item.label) + '</b><small>' + escapeHtml(item.kind) + ' · ' + prettyTime(item.time) + '</small></div></div>'
    ).join("");
  } catch (error) {
    $("connection-label").textContent = "API OFFLINE";
    $("api-status").textContent = "UNAVAILABLE";
    $("api-status").className = "status-value warn";
    $("last-check").textContent = "RETRY REQUIRED";
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

$("refresh-btn").addEventListener("click", () => { loadDashboard(); toast("SYSTEM DIAGNOSTICS REFRESHED"); });
document.querySelectorAll(".action-tile").forEach(button => {
  button.addEventListener("click", () => {
    const messages = {
      assistant: "ASSISTANT UI IS PLANNED — NO MODEL PROVIDER IS CONNECTED YET.",
      research: "RESEARCH AGENT IS IN THE ROADMAP — WEB PROVIDER NOT CONNECTED.",
      security: "SECURITY PROTOCOL ACTIVE — EXTERNAL ACTIONS REQUIRE HUMAN APPROVAL.",
      integrations: "NO EXTERNAL ACCOUNTS LINKED — CONNECTORS WILL BE ADDED IN A LATER PHASE."
    };
    $("action-feedback").textContent = messages[button.dataset.action] || "MODULE NOT AVAILABLE.";
    toast("MODULE STATUS UPDATED");
  });
});
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
  });
});
loadDashboard();
