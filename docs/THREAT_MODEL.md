# ULTRON Security Threat Model

## Purpose
This baseline threat model identifies assets, trust boundaries, likely abuse cases, expected controls, and residual risks for a personal AI command center. Revisit it whenever new integrations, tools, or autonomous workflows are introduced.

## Assets
- Administrator credentials, one-time setup key, session signing secret, and encryption keys.
- Session cookies, OAuth tokens, and integration credentials.
- User memories, prompts, task content, and personal data.
- Persistent records, queued jobs, audit events, and backups.
- Integrity of approval decisions and external side effects.
- Availability of the dashboard and API.

## Threat sources
Unauthenticated internet users; authenticated users exceeding their permissions; compromised integrations; prompt injection in emails, documents, or web pages; malformed model output; operator misconfiguration; leaked screenshots; dependency compromise; and accidental data loss.

## Trust boundaries
The browser, AI provider, retrieved content, external integrations, database, and background worker are separate trust zones. Treat data crossing each boundary as untrusted and validate it at the receiving boundary.

## Threats and expected mitigations

| Threat | Example | Required mitigation |
|---|---|---|
| Credential compromise | Setup key or password leaks | High-entropy secrets, password hashing, rotation, no secret logging |
| Session theft | Cookie copied from a device | HTTPS, HttpOnly/SameSite cookies, bounded lifetime, server-side revocation |
| CSRF | Cross-site request triggers a state change | CSRF validation and appropriate origin checks |
| Brute force / exhaustion | Repeated login or expensive API calls | Per-route and global rate limits, bounded bodies, structured 429 responses |
| Broken authorization | Client calls an admin endpoint directly | Server-side authorization on every protected route |
| Prompt injection | Retrieved content requests data exfiltration | Treat retrieved content as data, tool allowlists, least privilege, approval gates |
| Unsafe model action | Model invents a command | Strict schemas, independent server-side policy checks, no free-form execution |
| Duplicate side effect | Worker retries a message or transaction | Idempotency, deduplication, durable job state, execution-time policy checks |
| Token disclosure | OAuth token appears in logs | Encryption at rest, redaction, minimal scopes, revocation and rotation |
| Data loss | Ephemeral host restarts | Durable storage, scheduled backups, tested restoration |
| Supply-chain compromise | Malicious dependency update | Minimal dependencies, reviewed update PRs, CI and lockfile integrity |
| Information disclosure | Stack trace reaches browser | Generic client errors, protected logs, no secrets in diagnostics |

## AI-specific safety requirements
1. Treat user input, memory, retrieved documents, tool results, and model output as untrusted.
2. Never let a prompt or model response grant permissions.
3. Give each tool a narrow schema and explicit operation allowlist.
4. Separate planning from execution; the executor independently validates identity, authorization, and policy.
5. Require fresh, explicit operator confirmation for consequential external side effects.
6. Show the exact target, scope, and effect before approval.
7. Audit approval and execution outcomes without storing secrets.
8. Refuse safely when identity, target, or policy cannot be verified.

## Release-blocking verification
- [ ] No secrets, tokens, user exports, or production database files are committed.
- [ ] Setup cannot be reopened after administrator initialization.
- [ ] Login throttling and API rate limits are active and return structured errors.
- [ ] CSRF rejects missing or invalid tokens on state-changing browser routes.
- [ ] Protected routes reject unauthenticated and unauthorized requests.
- [ ] Logout and session revocation work.
- [ ] AI output cannot invoke an unapproved operation.
- [ ] Background jobs re-check authorization and approval before side effects.
- [ ] Backup restoration has been tested.
- [ ] Dependency and CI results have been reviewed.

## Residual risks
A checklist does not prove a control is implemented. Automated tests, code review, deployment inspection, and monitoring are required. Connected accounts may have broader permissions than the application needs; use the smallest scopes and revoke unused connections. No system can guarantee zero risk.
