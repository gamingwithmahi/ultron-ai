require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const startedAt = Date.now();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: "32kb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: process.env.APP_NAME || "ULTRON",
    status: "operational",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    integrations: {
      gmail: "not_connected",
      calendar: "not_connected",
      youtube: "not_connected",
      whatsapp: "not_connected",
      trading: "simulation_only"
    }
  });
});

app.get("/api/overview", (_req, res) => {
  res.json({
    assistant: "ULTRON",
    mode: "FOUNDATION",
    security: "approval_required",
    agents: [
      { id: "personal", name: "Personal Assistant", state: "standby" },
      { id: "research", name: "Research Agent", state: "standby" },
      { id: "memory", name: "Memory Engine", state: "planned" },
      { id: "communications", name: "Communications", state: "planned" },
      { id: "market", name: "Market Intelligence", state: "simulation" }
    ],
    activity: [
      { time: new Date().toISOString(), label: "ULTRON core initialized", kind: "system" },
      { time: new Date().toISOString(), label: "External integrations awaiting authorization", kind: "security" }
    ]
  });
});

app.get("/api/status", (_req, res) => {
  res.json({ status: "online", environment: process.env.NODE_ENV || "development", node: process.version });
});

app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found" });
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`ULTRON foundation running at http://${HOST}:${PORT}`);
});