# ULTRON — Personal AI Command Center

ULTRON is a modular personal-assistant platform. This repository contains the first dashboard and backend foundation.

## Current status — v0.1.0

- Futuristic responsive command-center dashboard
- Animated ULTRON core visual
- Express API with health and overview endpoints
- Basic security headers and API rate limiting
- Agent status panel and local activity feed
- Human-approval-first design principles

## Not connected yet

Gmail, Google Calendar, YouTube, WhatsApp, phone controls, AI model providers, long-term memory, and live trading are **not connected** in this foundation. The dashboard labels these accurately. Market intelligence is simulation-only; no real orders can be placed.

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open http://127.0.0.1:8080

For a cloud deployment, configure `HOST=0.0.0.0` in the hosting environment and use HTTPS at the platform edge. Do not expose a development instance directly to the public internet.

## Security principles

- Never commit `.env`, API keys, OAuth tokens, or personal data.
- External actions (sending messages, publishing, deleting, financial transactions) must require explicit user approval.
- Treat incoming emails, webpages, documents, and messages as untrusted input.
- Trading remains paper/simulation-only until risk controls, data sources, and explicit authorization are implemented.

## Roadmap

1. Dashboard and backend foundation (current)
2. Authentication, approval center, and audit trail
3. PostgreSQL + pgvector memory
4. AI provider abstraction and personal assistant
5. Gmail and Calendar integrations
6. YouTube workflows
7. Messaging and Android companion
8. Market intelligence and paper trading
9. Cloud deployment and monitoring

## License

All rights reserved.