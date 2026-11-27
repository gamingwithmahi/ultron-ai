# ULTRON — Personal AI Command Center

ULTRON is a modular personal AI platform built around operator control, explicit permissions, and auditable actions.

## Current release: v0.2.0 — Secure foundation

- Futuristic responsive command-center dashboard and animated core
- Express API with security headers and API rate limits
- First-run administrator setup protected by a server-side one-time setup key
- Password hashing with Node.js scrypt; passwords are never stored in plaintext
- Signed, HTTP-only, SameSite=Strict session cookie
- CSRF token validation for state-changing authenticated requests
- Server-side OpenAI Responses API adapter and authenticated chat endpoint (API key required)\n- Session-only chat history; prompts are not saved to the ULTRON JSON store\n- Approval Center with pending / approved / rejected states
- Persistent JSON data store with atomic file replacement
- Audit events for administrator access and approval changes
- GitHub Actions syntax and smoke-test workflow

## Important capability boundaries

This release is a secure application foundation, not yet an autonomous assistant. Gmail, Calendar, YouTube, WhatsApp, Android calling, and live market feeds are **not connected**. The AI chat uses the OpenAI Responses API only after an operator configures a server-side API key. Market intelligence is marked simulation-only. Approval records do not execute external actions. No real trades, messages, publishing, or deletion can be triggered by approving a record.

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
- `ULTRON_SESSION_SECRET` (separate random secret, minimum 32 characters)\n- `OPENAI_API_KEY` (optional; enables ULTRON Chat; never put this key in browser code)\n- `OPENAI_MODEL` (optional; defaults to `gpt-6.2-astra`)
- `TRUST_PROXY=true` only when the app is behind a trusted reverse proxy

Use HTTPS. Do not deploy with example secrets. This JSON persistence layer is intended for a single application instance with persistent disk. For horizontal scaling or ephemeral hosting, move to PostgreSQL before production use.

## Security model

- Never commit `.env`, API keys, OAuth tokens, session secrets, or personal data.
- Use a unique, long administrator password.
- External actions must require explicit operator approval and a separate execution service.
- Treat incoming emails, webpages, documents, and messages as untrusted input.
- Do not allow an LLM to grant itself permissions or bypass approval gates.
- Financial activity stays simulation-only until market data validation, risk controls, and explicit authorization are implemented.

## Architecture roadmap

1. **Foundation (current):** dashboard, API, secure operator login, approval records, audit events, authenticated AI chat.
2. **Data layer:** PostgreSQL migrations, backups, retention, and durable audit storage.
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