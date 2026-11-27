# Contributing to ULTRON

Thank you for helping improve ULTRON. Changes should preserve operator control, least privilege, and clear capability boundaries.

## Before changing code

1. Read the [Security Policy](SECURITY.md) and [Operations Runbook](docs/OPERATIONS_RUNBOOK.md).
2. Check the current architecture and capability boundaries in [README.md](README.md).
3. Keep changes focused; avoid unrelated formatting or dependency churn.
4. Never include credentials, real user data, session cookies, or production database exports.

## Development setup

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run check
npm start
```

Use local-only development credentials. Do not reuse production secrets.

## Engineering requirements

- Validate all untrusted input at the server boundary.
- Enforce authentication and authorization on the server for every protected operation.
- Preserve CSRF checks for state-changing browser requests.
- Keep rate limits enabled and return structured, non-sensitive errors.
- Use parameterized SQL; never concatenate user input into SQL statements.
- Avoid logging credentials, tokens, session identifiers, or sensitive personal content.
- Keep external integrations read-only until explicit write scopes and authorization are reviewed.
- Treat model output as untrusted data, never as authorization.
- Keep consequential actions behind explicit operator approval and a separately reviewed executor.
- Add or update automated tests for behavior changes and security-sensitive paths.
- Update documentation when configuration, behavior, or capability boundaries change.

## Dependencies

- Prefer maintained packages with a clear security and maintenance record.
- Keep dependency changes minimal and explain why each new dependency is needed.
- Do not commit generated dependency folders.
- Review automated dependency update diffs before merging or deploying.

## Pull request review checklist

- [ ] The change has a clear user or operational benefit.
- [ ] Tests cover the changed behavior and relevant failure cases.
- [ ] `npm run check` passes.
- [ ] No secrets or personal data are present.
- [ ] Authentication, authorization, CSRF, and rate-limit protections remain intact.
- [ ] Capability claims and documentation remain accurate.
- [ ] Rollback implications are understood.

## Release authority

A green CI run is necessary but not sufficient for production release. Follow the [Release Checklist](docs/RELEASE_CHECKLIST.md) and verify the deployed environment independently.
