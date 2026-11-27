# ULTRON Architecture — v0.2

## Runtime layers

- **Presentation:** static responsive command-center UI with authenticated chat workspace.
- **HTTP API:** Express routes, validation, rate limits, Helmet security headers.
- **Identity:** one administrator, scrypt password hash, signed session cookie, CSRF validation.
- **AI provider:** server-side OpenAI Responses API adapter; API key stays in environment variables, chat requests are authenticated and rate-limited, and provider storage is disabled for responses.
- **Control plane:** approval records and append-first bounded audit events.
- **Persistence:** PostgreSQL-backed JSONB state record when `DATABASE_URL` is configured; local atomic JSON fallback for development.
- **Operator memory:** explicitly saved preference/project/fact/reminder records, with deletion controls.
- **Task control:** persistent queue with validated status transitions; tasks are not executed by workers yet.

## Trust boundaries

Browser input is untrusted. The server validates every state-changing request. Approval status is metadata only and is not an execution capability. AI-generated text must never be interpreted as authorization.

## Planned service boundaries

- Identity and access service
- Agent orchestration and task queue
- Connector adapters with OAuth scopes
- Approval policy engine
- Tool execution workers with allowlists and timeouts
- Memory service with user controls
- Audit and observability pipeline

## Scaling decision

The current JSON store is deliberately simple and suitable only for one process on persistent storage. Before multi-instance deployment, migrate to PostgreSQL transactions and shared session storage. Queue-based work should use a durable queue rather than in-process timers.
