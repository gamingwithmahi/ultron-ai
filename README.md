# ULTRON — Personal AI Command Center

## Current release: v2.2.0 — Focus Session & Productivity Intelligence

ULTRON is a modular personal AI platform built around operator control, explicit permissions, and auditable actions.

## Previous release: v1.5.0 — Approval Governance & Security Center

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
- Versioned PostgreSQL migrations with a schema-version ledger and transaction-scoped advisory lock
- Normalized PostgreSQL projections for approvals, tasks, memories, and audit events, synchronized transactionally with the canonical state record
- PostgreSQL-backed persistent state when `DATABASE_URL` is configured (local JSON fallback for development)
- Operator-controlled memory vault with add/list/delete controls
- Authenticated system diagnostics for database durability, AI provider readiness, and integration status, surfaced in the operator dashboard
- Dashboard audit trail with recent security and workflow events, plus manual refresh
- Authenticated JSON backup export for approvals, audit events, tasks, and memories; administrator password hashes and session data are excluded
- Dashboard overview is now protected by administrator authentication
- Durable PostgreSQL background job queue with atomic `FOR UPDATE SKIP LOCKED` claims, worker leases, bounded concurrency, retry/backoff, and graceful shutdown
- Strict allowlist of internal maintenance jobs (expired-session cleanup and database health snapshot); no arbitrary code or external actions can be queued
- Authenticated job API and dashboard job monitor with status, attempts, results, and failure visibility
- Existing operator task queue remains a planning tracker and is separate from executable maintenance jobs
- Separate Gmail and Google Calendar OAuth flows with minimal read-only scopes
- Daily Briefing API combines latest inbox metadata, upcoming calendar events, active tasks, and pending approvals
- Dashboard briefing panel with per-service connection notices and read-only summaries
- One-time state validation, short-lived OAuth state records, and SameSite=Lax callback cookie
- Google access and refresh tokens encrypted at rest using AES-256-GCM
- Integration Center with per-service connection status and disconnect/revoke control
- Google account integration requires PostgreSQL and explicit operator consent; no email sending or calendar editing scopes
- Audit events for administrator access and approval changes
- GitHub Actions syntax and smoke-test workflow

## Background job engine

The worker runs only when PostgreSQL is configured. It accepts two fixed maintenance job types: expired-session cleanup and database health snapshots. Claims are transactionally locked so multiple service instances do not claim the same queued job. Stale worker leases are recovered, failures retry with bounded exponential backoff, and exhausted jobs become failed. User-created task records remain non-executable planning items. The job engine cannot send messages, publish content, delete user data, call third-party APIs, or perform financial actions.

## Important capability boundaries

This release is a secure operator-controlled assistant foundation, not yet an autonomous assistant. Memory entries are explicitly saved by the operator; task queue items are tracking records only and are not executed automatically. Gmail and Calendar have a read-only OAuth connection flow but require Google Cloud credentials and explicit operator consent before they can connect. YouTube, WhatsApp, Android calling, and live market feeds are **not connected**. The AI chat uses the OpenAI Responses API only after an operator configures a server-side API key. Market intelligence is marked simulation-only. Approval records do not execute external actions. No real trades, messages, publishing, or deletion can be triggered by approving a record.

## Requirements and local setup

- Node.js 20+
- npm

```bash
npm install
cp .env.example .env
```

Set a long random `ULTRON_SETUP_KEY`, a separate `ULTRON_SESSION_SECRET`, and a separate `ULTRON_TOKEN_ENCRYPTION_KEY` (each at least 32 characters for production). Production also requires a valid PostgreSQL `DATABASE_URL`; startup is blocked when these security and durability requirements are not met. Then run:

```bash
npm start
```

Open `http://127.0.0.1:8080`. The first visit shows the one-time administrator setup. Keep the setup key private; it is entered only into the first-run setup screen and is never committed to Git.

## Deployment notes

Configure these environment variables in the hosting provider. Production startup requires all three ULTRON secrets and PostgreSQL; do not remove the setup key after first-run setup because the production validator still requires it:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` (provided by most hosts)
- `ULTRON_SETUP_KEY` (long random value; keep configured because production startup validates it)
- `ULTRON_SESSION_SECRET` (separate random secret, minimum 32 characters)
- `ULTRON_TOKEN_ENCRYPTION_KEY` (separate random secret, minimum 32 characters)
- `DATABASE_URL` (PostgreSQL connection URL; required in production)
- `OPENAI_API_KEY` (optional; enables ULTRON Chat; never put this key in browser code)
- `OPENAI_MODEL` (optional; defaults to `gpt-6.2-astra`)
- `TRUST_PROXY=true` only when the app is behind a trusted reverse proxy

Use HTTPS. Do not deploy with example secrets. When `DATABASE_URL` is configured, ULTRON stores the application state in PostgreSQL. The local JSON fallback is for development only.

See [Google OAuth setup](docs/GOOGLE_OAUTH.md) for Google Cloud and Render configuration. See [the configuration catalog](docs/CONFIGURATION_CATALOG.md) and [project blueprint](docs/PROJECT_BLUEPRINT.md) for the complete integration/key roadmap. See the [operations runbook](docs/OPERATIONS_RUNBOOK.md), [release checklist](docs/RELEASE_CHECKLIST.md), and [security policy](SECURITY.md) before production deployment.

## Security model

- Never commit `.env`, API keys, OAuth tokens, session secrets, or personal data.
- Use a unique, long administrator password.
- External actions must require explicit operator approval and a separate execution service.
- Treat incoming emails, webpages, documents, and messages as untrusted input.
- Do not allow an LLM to grant itself permissions or bypass approval gates.
- Financial activity stays simulation-only until market data validation, risk controls, and explicit authorization are implemented.

## Architecture roadmap

1. **Foundation (current):** dashboard, API, secure operator login, approval records, audit events, authenticated AI chat.
2. **Data layer:** promote normalized PostgreSQL records to the primary repository, add retention policies, and automate verified backups.
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


## v1.3 Agent Registry & Notifications

- Authenticated registry reports verified capability, status, permission, and execution mode for ten agents.
- Persistent in-app notifications for approval, task, maintenance-job, and memory events; mark read, dismiss, or clear all.
- Notifications are included in secure operator backup exports.
- Google helper requests have a 10-second timeout and normalized provider errors.
- Planned integrations remain disabled; Gmail/Calendar stay read-only; market execution stays simulation-only.


## v1.3 Intelligence Engine

- Deterministic, read-only workspace intelligence combines Gmail metadata, upcoming Calendar events, task priorities, and pending approvals.
- Inbox classification highlights security, urgent, finance, and action-oriented subject/snippet patterns; it does not modify messages.
- Calendar overlap detection compares timed event intervals and ignores all-day date-only events.
- Focus queue ranks active tasks by priority, progress state, and age.
- Dashboard shows insights, inbox priority, schedule conflicts, and focus queue; analysis is rules-based rather than an AI-generated judgement.
- Configuration Vault inventories core, AI, Google, planned YouTube, and planned WhatsApp environment variables without exposing secret values.
- Approval governance validates requests, enforces seven-day expiry and a 50-pending-request limit, and records reviewer/time.
- Live Security Center reports approval posture and security controls without exposing credentials or session tokens.
- Approval decisions remain records only; no external action executor is enabled.
- Authenticated configuration readiness endpoint reports only variable names, purpose, and configured/missing state.
- Central credential catalog and clean `.env.example` separate active integrations from planned integrations; no future connector secrets are required until implementation.
- Direct Gmail and Calendar fetches have 10-second timeouts and normalized errors.
- No email sending, calendar writes, autonomous actions, or real trading are enabled.


## v1.4 Configuration Vault

The authenticated Configuration Vault is a readiness inventory, not a secret editor. It never returns environment variable values. Configure current secrets in Render's private Environment settings after the project structure and integration contracts are complete. Planned connector variables are documented but intentionally not consumed by active routes.

## Build sequence

1. Complete the secure core and durable database.
2. Verify deployment and operator bootstrap.
3. Configure OpenAI and test chat.
4. Configure Google OAuth and verify read-only Gmail/Calendar access.
5. Implement YouTube OAuth scopes and connector before adding YouTube credentials.
6. Implement official Meta webhook verification and WhatsApp Cloud API before adding WhatsApp credentials.
7. Select verified research and market-data providers before requesting provider keys.
8. Keep all external write actions behind a separate, audited approval-and-execution service.


## v1.6 Central Brain & Knowledge Search

- Dedicated agent-orchestrator module defines all 12 agents from the ULTRON master specification.
- Each agent exposes category, domain, operating mode, live capability status, permissions, permission level, approval boundaries, and guardrails.
- Authenticated registry and individual agent-manifest endpoints; statuses derive from configured/connected state rather than assumptions.
- Central Brain reports capability-gated execution; no arbitrary agent tool execution or autonomous external writes are enabled.
- Trading remains simulation-only; YouTube, WhatsApp, phone, meeting, and live market research remain unavailable until official integrations are implemented and configured.
- Memory search supports Unicode-aware token matching, category/date filtering, relevance ranking, bounded pagination, and validation.
- Memory Vault dashboard includes search and category filtering; save/delete remains operator-controlled.
- No new credentials are required for this release.

## v1.6 API

- `GET /api/agents` — authenticated 12-agent capability registry.
- `GET /api/agents/:id` — authenticated manifest for one known agent.
- `GET /api/memory/search?query=...&category=...&limit=20&offset=0` — authenticated, read-only memory search.


## v1.7 Persistent Knowledge Intelligence

- Knowledge records support title, category, content, source, source reference, context, tags, importance, pin state, creation/update timestamps, and operator provenance.
- Memory writes validate metadata and reject common credential-like key/value patterns; do not use the vault for passwords, OTPs, API keys, or tokens.
- Operator can update/pin/unpin and delete individual records; all mutations require an authenticated session and CSRF validation.
- Search includes title, content, context, tags, category, pin filtering, weighted relevance, and pinned/importance ranking.
- Knowledge stats report total, pinned, high-importance, per-category counts, and latest update.
- PostgreSQL migration v4 adds normalized metadata columns and pinned/importance indexes; JSONB state remains canonical.
- Existing records migrate safely with metadata defaults; no user credentials or new provider keys are needed.
- The existing secure backup export continues to include knowledge records.

## v1.7 API

- GET /api/memory/stats — knowledge vault metrics.
- PATCH /api/memory/:id — update validated metadata or pin state (CSRF protected).
- GET /api/memory/search?query=...&category=...&pinned=true — weighted metadata-aware search.


## v1.8 Context-Aware Central Brain

- The authenticated AI chat now retrieves up to six relevant operator knowledge records and up to five active tasks, plus the pending approval count.
- Retrieval uses the metadata-aware knowledge search engine; pinned and higher-importance records are ranked appropriately.
- Retrieved content is explicitly framed as untrusted data, not instructions or system policy; common credential-like content is excluded from the assistant context.
- Chat responses include a retrieval summary so the dashboard can show how much workspace context was supplied.
- Authenticated context-preview endpoint allows retrieval diagnostics without calling the AI provider.
- OpenAI Responses API storage remains disabled with `store: false`; chat history remains client-session-only.
- No new credentials or provider scopes are required for this release.

## v1.8 API

- `GET /api/assistant/context-preview?query=...` — inspect context retrieval counts and relevant memory titles.
- `POST /api/assistant/chat` — now receives safe, relevant workspace context in server-side instructions.


## v1.9 Google Workspace Intelligence & Planning

- Read-only smart inbox classification into security, urgent, finance, work, personal, updates, and general categories.
- Priority ranking, unread counts, explainable keyword reasons, and bounded inbox summaries.
- Heuristic follow-up date detection for today, tomorrow, relative day counts, and weekday references.
- Link and attachment metadata warnings; ULTRON never opens message links or attachments.
- Reply draft suggestions are generated locally as unsubmitted text; no send endpoint or send scope exists.
- Conflict-aware focus-slot suggestions for the next five weekdays in Asia/Dhaka time, with bounded 15–240 minute durations.
- Meeting preparation packets connect upcoming calendar metadata with related email subjects, saved knowledge, and active tasks.
- Agenda prompts help identify outcomes, decisions, blockers, and owners.
- Authenticated `GET /api/workspace/command-plan` returns a bounded, no-store workspace plan.
- No email bodies are fetched, no attachments/links are opened, no messages are sent, and no calendar events are changed.
- Google integrations remain read-only and require operator OAuth connection before live data appears.


## v2.0 Operator Workflow Orchestration

- Durable reminders in canonical application state (PostgreSQL when configured, atomic local JSON fallback otherwise).
- Reminder create, list, complete, snooze, delete APIs with bounds, audit events, and in-app notifications.
- Daily and weekly recurrence creates the next occurrence only after operator completion.
- Asia/Dhaka timezone metadata and overdue/due-soon summaries.
- Four fixed playbooks: Daily Command Briefing, Weekly Operations Review, Inbox Triage Session, Project Launch Checklist.
- Ordered operator checklist progress, pause/resume, and completion tracking.
- Active workflow limits, bounded records, and combined operations snapshot.
- No arbitrary code execution, autonomous external actions, push alarms, email sending, or calendar modification.
- Authenticated and CSRF-protected mutations; no new credentials or provider scopes.


## v2.1 Intelligent Task & Notification Command System

- Tasks support category, optional due date/time, estimated effort, and up to five prerequisites.
- Priority scoring ranks critical/high/normal/low work with due-date urgency and in-progress weighting.
- Overdue, due-soon, blocked, active, completed, and category summaries.
- Dependency-aware completion prevents closing a task while prerequisites remain incomplete.
- Authenticated task insights endpoint and operator dashboard task metrics.
- Notification classification and severity ranking for security, approvals, reminders, tasks, workflows, and system events.
- Unread notifications rank ahead of read items; security and urgent warnings receive elevated severity.
- Existing CSRF-protected task and notification mutations remain in force.
- No autonomous task execution, no external actions, and no push/email/WhatsApp delivery is claimed.


## v2.2 Focus Session & Productivity Intelligence

- Operator-started focus sessions with 5–180 minute targets and optional task links.
- Pause, resume, complete, and cancel lifecycle with timestamped work segments.
- Server-calculated elapsed time, remaining time, progress percentage, and target reached indicator.
- One running focus session at a time; paused sessions can be resumed.
- Daily and lifetime focus summaries, completed session counts, average completed duration, and recent daily totals.
- Authenticated focus APIs with CSRF-protected state transitions and audit/in-app notification events.
- Sessions persist in canonical application state (PostgreSQL when configured; local JSON fallback).
- The timer does not block apps, inspect device activity, or send push notifications.

## Engineering and security references

- [Architecture overview](docs/ARCHITECTURE.md) — runtime modules, trust boundaries, and operating modes.
- [Threat model](docs/THREAT_MODEL.md) — assets, abuse cases, AI-specific safeguards, and release-blocking checks.
- [Security policy](SECURITY.md) — vulnerability reporting and security expectations.
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md) — deployment and incident procedures.
- [Release checklist](docs/RELEASE_CHECKLIST.md) — required verification before production releases.
- [Contributing guide](CONTRIBUTING.md) — engineering and review standards.
