# ULTRON Architecture Overview

## Scope and verified baseline

This document describes the repository's architecture as represented by the current source and module names. It distinguishes implemented foundations from planned capabilities. A module name or dashboard control is not proof that an external action is enabled.

## Runtime layers

- **Presentation:** static responsive command-center UI in `public/`. The browser is an untrusted client.
- **HTTP API:** Express application in `server.js`, with request parsing, Helmet security headers, API rate limiting, authentication, CSRF checks, and API routes.
- **Identity:** one administrator, scrypt password hashing, signed session cookie, server-side session handling, and CSRF validation.
- **AI provider:** server-side adapter in `lib/ai-provider.js`. Provider use depends on private environment configuration; keys must never reach the browser.
- **Control plane:** approval policy and orchestration modules. Approval records are governance metadata, not an execution capability.
- **Persistence:** PostgreSQL-backed state when `DATABASE_URL` is configured; local atomic JSON fallback for development. Local file mode is not suitable for ephemeral production storage.
- **Operator memory:** `lib/memory-records.js`, `lib/memory-search.js`, and `lib/assistant-context.js` separate memory records, retrieval, and context assembly.
- **Task and workflow intelligence:** `lib/workflow-engine.js`, `lib/task-intelligence.js`, `lib/notification-intelligence.js`, and `lib/focus-sessions.js` provide domain-specific logic.
- **Background processing:** `lib/job-worker.js` owns worker behavior. Re-check authorization and approval at execution time before any future side effect.
- **Google OAuth:** `lib/google-oauth.js` implements the OAuth boundary. Actual account access depends on deployment configuration, scopes, and successful authorization.

## Trust boundaries

1. **Browser → API:** all browser inputs are untrusted. Validate on the server; enforce authentication, authorization, CSRF protection, and rate limits.
2. **API → persistence:** use parameterized database operations, bounded inputs, safe transactions, and non-sensitive client errors.
3. **Application → AI provider:** prompts and responses are untrusted. Model output is never permission to execute an operation.
4. **Application → external integration:** connection status does not imply authorization for every action. Keep scopes narrow and separate read from write access.
5. **Queue → worker:** jobs may execute after the initiating session ends. Re-check identity, policy, approval freshness, and idempotency at execution time.

## Non-negotiable invariants

- UI visibility is not authorization; every protected route enforces access on the server.
- State-changing browser requests retain CSRF defenses.
- AI-generated plans cannot bypass server-side policy.
- Consequential external side effects require explicit, scoped operator approval.
- Retried jobs must not duplicate non-idempotent side effects.
- Secrets, tokens, cookies, and sensitive personal content are excluded from logs and source control.
- A local JSON fallback is for development, not ephemeral production hosting.
- Simulation-only features must never be represented as live execution.

## Operating modes

| Mode | Intended use | Important boundary |
|---|---|---|
| Local JSON store | Single-process development | Not durable on ephemeral hosting |
| PostgreSQL | Persistent deployment | Requires secure connection, backups, and migration discipline |
| AI provider absent | Core/local features | Provider-backed generation is unavailable |
| AI provider configured | Assistant responses | Model output remains untrusted |
| Integration disconnected | No external account access | UI must not imply a connected capability |
| Trading simulation | Demonstration and testing | No real-money execution |

## Planned boundaries before broader autonomy

Any future tool-execution service must have a strict operation allowlist, typed input schemas, per-tool permissions, timeouts, idempotency, audit records, and independent approval checks. Planning and execution must remain separate services. Do not implement arbitrary shell, browser, or network execution as a generic model tool.

## Change discipline

Before introducing a new integration or executor, document its data inputs, permissions, side effects, failure modes, audit events, retention, and rollback plan. Add automated tests at both the API and policy boundaries. Update this document whenever module ownership or trust boundaries change.
