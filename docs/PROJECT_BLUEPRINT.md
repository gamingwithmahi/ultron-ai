# ULTRON project blueprint

## Product objective

ULTRON is a private, operator-controlled personal AI operating system. It is not an unrestricted autonomous agent. Every integration has an explicit capability manifest, least-privilege scopes, an observable status, and a defined human-approval boundary.

## Repository structure

```
ultron-ai/
├── server.js                    # Express API, authentication, routes, startup
├── package.json                 # Node 20+ runtime and verification scripts
├── render.yaml                  # Render Web Service + PostgreSQL blueprint
├── .env.example                 # Names/placeholders only; never real credentials
├── lib/
│   ├── ai-provider.js           # Server-side OpenAI Responses API adapter
│   ├── configuration.js         # Secret-safe environment readiness inventory
│   ├── db-migrations.js         # Versioned PostgreSQL schema + projections
│   ├── google-oauth.js          # OAuth state, encryption, token refresh
│   ├── intelligence.js          # Deterministic read-only workspace analysis
│   └── job-worker.js            # Allowlisted internal maintenance jobs
├── public/
│   ├── index.html               # Operator command-center structure
│   ├── app.js                   # Authenticated dashboard client
│   └── styles.css               # Responsive visual system
├── tests/
│   ├── smoke.test.js            # Route, security, and dashboard contracts
│   └── intelligence.test.js     # Deterministic intelligence cases
└── docs/
    ├── GOOGLE_OAUTH.md
    ├── CONFIGURATION_CATALOG.md
    └── PROJECT_BLUEPRINT.md
```

## Agent modules and readiness

| Agent | Current state | Next implementation boundary |
|---|---|---|
| Personal AI | Chat adapter foundation | Tool registry, context policy, provider fallback |
| Memory | Structured operator knowledge vault | Search, metadata, pinning, audit, export and delete |
| Gmail | OAuth read-only | Safe message triage; drafts only after compose scope review |
| Calendar | OAuth read-only | Availability suggestions; writes remain approval-gated |
| Research | Planned | Provider selection, SSRF-safe fetch, source citations |
| YouTube | Planned | YouTube OAuth scopes, channel analytics and content workflow |
| WhatsApp | Planned | Official Meta Cloud API, webhook verification and opt-in controls |
| Meeting | Planned | Consent-aware notes and explicit recording policy |
| Device | Planned | Android companion bridge with per-device permissions |
| Market | Simulation-only | Verified feeds, backtesting and paper trading only |

## Data and execution boundaries

- PostgreSQL is the production source of durable application state; JSON storage is a local-development fallback.
- Google OAuth tokens are encrypted at rest. Google scopes currently remain read-only.
- The task queue is a planning tracker. The background worker accepts only fixed maintenance job types.
- Approval records do not execute actions. A future executor must independently validate action type, target, scope, expiry, replay protection, and operator confirmation.
- Email bodies, webpages, documents, and chat messages are untrusted data. They cannot change agent permissions or system policy.
- Market integrations must remain simulation-only until risk controls and a separately authorized execution design are reviewed.

## Environments and deployment

- Local: Node.js 20+, `npm install`, copy `.env.example` to `.env`, configure setup/session secrets, then `npm start`.
- Render: deploy `main` with `npm install` and `npm start`; use PostgreSQL; health check `/api/health`.
- Never commit `.env`, credentials, OAuth tokens, database dumps, or personal data.
- A successful GitHub Actions run verifies code/tests; it does not prove Render is deployed or OAuth is connected.

## Completion gates

1. Repository and automated tests pass.
2. Render deployment is confirmed healthy.
3. First administrator setup is complete and setup key is retired/rotated.
4. Core secrets are present in Render Environment.
5. Each integration is connected with the intended minimum scopes.
6. Backup/restore and session revocation are tested.
7. Sensitive write actions remain disabled until approval executor and audit controls are implemented.


## v1.7 knowledge model

Knowledge entries carry a title, category, content, source, optional source reference, context, tags, importance, pinned state, creation/update timestamps, and operator provenance. The server rejects common secret-like key/value patterns. Search currently ranks the loaded canonical application state in the application layer; PostgreSQL metadata columns and indexes support future scale, but this release does not claim vector embeddings or semantic search. Mutations are authenticated, CSRF-protected, auditable, and operator-controlled.
