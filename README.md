# ULTRON — Personal AI Command Center

ULTRON is a modular personal AI platform built around operator control, explicit permissions, and auditable actions.

## Current release: v0.7.0 — Durable PostgreSQL login sessions

- Futuristic responsive command-center dashboard and animated core
- Express API with security headers and API rate limits
- First-run administrator setup protected by a server-side one-time setup key
- Password hashing with Node.js scrypt; passwords are never stored in plaintext
- Signed, HTTP-only, SameSite=Strict session cookie with an eight-hour expiry
- PostgreSQL-backed session registry stores only SHA-256 token hashes; logout revokes the server-side record
- Expired session records are cleaned up during new sign-ins; local development retains an in-memory session fallback
- CSRF token validation for state-changing authenticated requests
- Server-side OpenAI Responses API adapter and authenticated chat endpoint (API key required)
- Session-only chat history; prompts are not saved to the ULTRON JSON store
- Approval Center with pending / approved / rejected states
- PostgreSQL-backed persistent state when `DATABASE_URL` is configured (local JSON fallback for development)
- Operator-controlled memory vault with add/list/delete controls
- Authenticated system diagnostics for database durability, AI provider readiness, and integration status, surfaced in the operator dashboard
- Dashboard audit trail with recent security and workflow events, plus manual refresh
- Authenticated JSON backup export for approvals, audit events, tasks, and memories; administrator password hashes and session data are excluded
- Dashboard overview is now protected by administrator authentication
- Task queue with priority and manual lifecycle tracking; no background execution
- Audit events for administrator access and approval changes
- GitHub Actions syntax and smoke-test workflow

## Important capability boundaries

This release is a secure operator-controlled assistant foundation, not yet an autonomous assistant. Memory entries are explicitly saved by the operator; task queue items are tracking records only and are not executed automatically. Gmail, Calendar, YouTube, WhatsApp, Android calling, and live market feeds are **not connected**. The AI chat uses the OpenAI Responses API only after an operator configures a server-side API key. Market intelligence is marked simulation-only. Approval records do not execute external actions. No real trades, messages, publishing, or deletion can be triggered by approving a record.

## Requirements and local setup

- Node.js 20+
- npm

```bash
npm install
cp .env.example .env
```

Set a long random `ULTRON_SETUP_KEY` and a separate `ULTRON_SESSION_SECRET` (at least 32 characters in production), then run:

```bash
npm start
```

Open `http://127.0.0.1:8080`. The first visit shows the one-time administrator setup. Keep the setup key private; it is entered only into the first-run setup screen and is never committed to Git.

## Deployment notes

Configure these environment variables in the hosting provider:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` (provided by most hosts)
- `ULTRON_SETUP_KEY` (long random value; needed only until first admin is created)
- `ULTRON_SESSION_SECRET` (separate random secret, minimum 32 characters)
- `OPENAI_API_KEY` (optional; enables ULTRON Chat; never put this key in browser code)
- `OPENAI_MODEL` (optional; defaults to `gpt-6.2-astra`)
- `TRUST_PROXY=true` only when the app is behind a trusted reverse proxy

Use HTTPS. Do not deploy with example secrets. When `DATABASE_URL` is configured, ULTRON stores the application state in PostgreSQL. The local JSON fallback is for development only.

## Security model

- Never commit `.env`, API keys, OAuth tokens, session secrets, or personal data.
- Use a unique, long administrator password.
- External actions must require explicit operator approval and a separate execution service.
- Treat incoming emails, webpages, documents, and messages as untrusted input.
- Do not allow an LLM to grant itself permissions or bypass approval gates.
- Financial activity stays simulation-only until market data validation, risk controls, and explicit authorization are implemented.

## Architecture roadmap

1. **Foundation (current):** dashboard, API, secure operator login, approval records, audit events, authenticated AI chat.
2. **Data layer:** structured PostgreSQL migrations for approvals, tasks, memory, and audit events; backups and retention.
3. **AI orchestration:** model-provider abstraction, tool registry, task queue, prompt-injection defenses.
4. **Memory:** user-controlled long-term memory with inspect, edit, export, and delete flows.
5. **Integrations:** Gmail and Calendar OAuth, then YouTube; each connector gets scoped permissions.
6. **Companion:** Android app and notification bridge with explicit device permissions.
7. **Market intelligence:** verified data providers, backtesting, paper trading, risk limits; live execution remains separately gated.
8. **Operations:** observability, health checks, backups, deployment automation, and incident procedures.

## Verification

```bash
npm run check
```

## License

All rights reserved.

## Render deployment

ULTRON now supports PostgreSQL-backed persistent state when `DATABASE_URL` is set. On Render, deploy the repository as a Web Service with build command `npm install` and start command `npm start`; set `NODE_ENV=production`, `ULTRON_SESSION_SECRET` (at least 32 random characters), `ULTRON_SETUP_KEY` (a separate strong one-time setup secret), `OPENAI_API_KEY`, and `DATABASE_URL` as private environment variables. Set the health check path to `/api/health`. The server binds to `0.0.0.0` and uses PostgreSQL for application state and durable login sessions when configured. Without `DATABASE_URL`, it falls back to local JSON for development only.

**Render free-tier warning:** Free web services sleep after 15 minutes idle and their local filesystem is ephemeral; free Render Postgres expires after 30 days and has no backups. Treat free resources as a temporary preview, not durable production hosting. Upgrade the database before storing important user or operational data. See [Render free instance limits](https://render.com/docs/free) and [Render web services](https://render.com/docs/web-services).
