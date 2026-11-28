# ULTRON — Personal AI Command Center

ULTRON is a self-hosted, operator-controlled AI dashboard built with Node.js, Express, and PostgreSQL. It provides authenticated AI chat, optional text-to-speech, operator-managed knowledge and tasks, approval records, maintenance jobs, health telemetry, and read-only Google Workspace integrations.

> Production note: CI success is not a substitute for live database, provider, backup-restore, and security acceptance tests. Complete the checklist below before storing important data.

## Features
- Responsive command-center dashboard with health telemetry and diagnostics.
- Administrator setup and login using Node.js scrypt password hashing.
- Signed HTTP-only session cookies, server-side revocation, CSRF validation, and rate limiting.
- Gemini or OpenAI server-side chat; provider credentials never enter browser code.
- Optional ElevenLabs text-to-speech for chat replies and the welcome greeting.
- PostgreSQL-backed application state, migrations, projections, and durable maintenance jobs.
- Local JSON storage for development only.
- Operator-managed approvals, tasks, workflows, reminders, notifications, audit events, and knowledge records.
- Read-only Gmail and Google Calendar OAuth integration.
- Graceful shutdown and GitHub Actions CI on Node.js 20, 22, and 24.

## Capability boundaries
ULTRON is an operator-controlled assistant foundation, not an unrestricted autonomous agent. Gmail and Calendar access is read-only. Approval records do not execute external actions. YouTube, WhatsApp, Android calling, live market feeds, and real trading are not active capabilities in this release. Chat history is held in the browser session and is not written to the ULTRON database by the chat route. Knowledge records are stored only when the operator explicitly saves them.

## Tech stack
- Node.js 20+, Express 5, PostgreSQL (`pg`)
- Helmet, express-rate-limit
- Vanilla JavaScript, HTML, and CSS
- Gemini API or OpenAI Responses API
- Optional ElevenLabs Text-to-Speech
- GitHub Actions

## Requirements
- Node.js 20 or newer and npm
- PostgreSQL for production
- Provider credentials for AI and voice features you want to enable

## Local installation
```bash
git clone https://github.com/gamingwithmahi/ultron-ai.git
cd ultron-ai
npm install
cp .env.example .env
```

Edit `.env` locally. Generate three different strong secrets for setup, session signing, and token encryption. For local-only development, `DATABASE_URL` may be empty and ULTRON uses `data/store.json`.

Start the server:
```bash
npm start
```

Open http://127.0.0.1:8080. On first run, create the administrator using `ULTRON_SETUP_KEY`. Keep the setup key private.

## Environment variables
| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | Production | Set to `production` on the host. |
| `HOST` | Host-dependent | Use `0.0.0.0` on Render/container hosts. |
| `PORT` | Host-dependent | Host-provided port; defaults to 8080. |
| `TRUST_PROXY` | If behind proxy | Set `true` only behind a trusted reverse proxy. |
| `ULTRON_SETUP_KEY` | Yes | Strong initial setup key; production config validation requires it. |
| `ULTRON_SESSION_SECRET` | Yes | Independent session-cookie signing secret. |
| `ULTRON_TOKEN_ENCRYPTION_KEY` | Yes | Independent encryption key for Google OAuth tokens. |
| `DATABASE_URL` | Production | PostgreSQL connection string; required for durable production state. |
| `PGSSLMODE` | Production | For Render internal connections use `require` (TLS with self-signed cert support); for external endpoints use `verify-full` when possible; `disable` is local-only. |
| `AI_PROVIDER` | If chat enabled | `gemini` or `openai`. |
| `GEMINI_API_KEY` | Gemini | Server-side Gemini API key. |
| `GEMINI_MODEL` | Gemini | Model identifier; defaults to `gemini-3.8-flash`. |
| `OPENAI_API_KEY` | OpenAI | Server-side OpenAI API key. |
| `OPENAI_MODEL` | OpenAI | Model identifier; defaults to `gpt-6.2-astra`. |
| `ELEVENLABS_API_KEY` | Voice | Server-side ElevenLabs API key with Text to Speech permission. |
| `ELEVENLABS_VOICE_ID` | Voice | Voice ID accessible to that ElevenLabs account. |
| `ELEVENLABS_MODEL_ID` | Voice | TTS model; defaults to `eleven_multilingual_v2`. |
| `GOOGLE_CLIENT_ID` | Google OAuth | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Google OAuth | Must exactly match the callback URL registered in Google Cloud. |
| `ULTRON_DATA_DIR` | Optional | Local JSON storage directory; development only. |

Never commit `.env`, database URLs, API keys, OAuth secrets, access tokens, or encryption keys. `.env.example` contains placeholders only.

## Verification
```bash
npm run check
```
This runs JavaScript syntax checks and the Node.js test suite. GitHub Actions runs the checks on Node.js 20, 22, and 24 for pushes and pull requests to `main`.

## Render deployment
1. Create a Render Node web service connected to this repository and the `main` branch.
2. Provision a managed PostgreSQL database in the same region.
3. Set build command to `npm install --no-audit --no-fund` and start command to `npm start`.
4. Set health check path to `/api/health`.
5. Set `NODE_ENV=production`, `HOST=0.0.0.0`, and `TRUST_PROXY=true`.
6. Configure independent strong values for `ULTRON_SETUP_KEY`, `ULTRON_SESSION_SECRET`, and `ULTRON_TOKEN_ENCRYPTION_KEY`.
7. Set `DATABASE_URL` from the database's internal connection string and use `PGSSLMODE=require` for Render internal URLs (TLS without certificate verification). For external URLs, use `PGSSLMODE=verify-full` when the certificate chain is trusted.
8. Add AI and ElevenLabs credentials privately in the host's environment settings. Never put secrets in source files or chat.
9. Deploy, verify `/api/health`, complete administrator setup, and test login, chat, voice, database persistence, and logout.

Render free web services may sleep when idle and use ephemeral local filesystems. Free PostgreSQL instances have limited retention and may expire. Free resources are for previews, not important production data. Upgrade to a persistent plan and establish tested backups before real use.

## Production deployment checklist
- [ ] HTTPS enabled; production secrets are strong, unique, and private.
- [ ] PostgreSQL transport encryption enabled; use `verify-full` for external database URLs and `require` for Render internal URLs with self-signed TLS.
- [ ] Database backup and restore procedure tested.
- [ ] Administrator setup completed; initial setup key stored securely and administrator password unique.
- [ ] Login, logout, session expiry, CSRF rejection, and rate-limit behavior tested.
- [ ] Gemini/OpenAI chat tested with the production provider and quota.
- [ ] ElevenLabs key permission, voice access, quota, and browser autoplay fallback tested.
- [ ] Gmail/Calendar OAuth redirect and least-privilege scopes tested if enabled.
- [ ] Health endpoint, logs, uptime, and alerting reviewed.
- [ ] Mobile, tablet, keyboard navigation, focus visibility, and reduced-motion behavior checked.
- [ ] No secrets, personal content, or raw prompts in application logs.
- [ ] CI passes on all supported Node versions; deploy and rollback procedure documented.

## Security and operations
- Use HTTPS in production and rotate any credential that has been exposed.
- Keep provider keys server-side and grant minimum provider permissions.
- Treat prompts, email content, documents, and model output as untrusted data.
- Keep external write actions disabled unless a separately reviewed executor, approval policy, audit trail, and rollback plan exist.
- Configure database backups and periodically test restoration.
- Monitor application logs and provider quotas without logging secrets or personal content.

See [SECURITY.md](SECURITY.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## License
All rights reserved.
