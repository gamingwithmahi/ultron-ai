# ULTRON Architecture — v0.2

## Runtime layers

- **Presentation:** static responsive command-center UI.
- **HTTP API:** Express routes, validation, rate limits, Helmet security headers.
- **Identity:** one administrator, scrypt password hash, signed session cookie, CSRF validation.
- **Control plane:** approval records and append-first bounded audit events.
- **Persistence:** atomic JSON snapshot for single-instance development deployments.

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
