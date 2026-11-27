# Operations and Release Runbook

This runbook defines the minimum safe operating process for ULTRON. It does not claim that integrations or autonomous actions are enabled.

## Runtime requirements

- Node.js 20 or newer
- npm dependencies installed from the repository
- HTTPS in production
- A strong, unique administrator password
- A unique `ULTRON_SESSION_SECRET` (at least 32 random characters)
- A separate, high-entropy `ULTRON_SETUP_KEY` for first-time administrator setup
- PostgreSQL for durable multi-instance or production persistence

The JSON file store is intended for local development. `ULTRON_DATA_DIR` may be set to a dedicated writable directory for isolated test runs or a controlled local data location. Do not rely on an ephemeral hosting filesystem for production data.

## Environment configuration

Configure secrets only in the hosting provider's private environment settings. Never commit real values.

| Variable | Purpose | Required |
|---|---|---|
| `NODE_ENV` | Set to `production` for deployment | Production |
| `PORT` | Hosting platform port | Platform-dependent |
| `HOST` | Bind address; use `0.0.0.0` on hosted services | Hosted |
| `ULTRON_SETUP_KEY` | One-time first administrator setup | Until setup is complete |
| `ULTRON_SESSION_SECRET` | Signs administrator sessions | Yes |
| `DATABASE_URL` | Durable PostgreSQL state and sessions | Production |
| `OPENAI_API_KEY` | Enables the configured AI provider | Optional |
| `TRUST_PROXY` | Trust a known reverse proxy | Only when correctly deployed behind one |

Do not expose secret values through diagnostics, logs, frontend bundles, or support messages.

## Deployment sequence

1. Review the exact commit and changed files.
2. Confirm CI passes on all supported Node.js versions.
3. Configure production secrets and PostgreSQL privately.
4. Deploy to a staging or preview environment first.
5. Verify `GET /api/health` returns a healthy response.
6. Complete administrator setup once; keep the setup key private.
7. Verify login, authenticated dashboard access, logout, and session revocation.
8. Verify CSRF protection and rate-limit behavior.
9. Verify persistence across a restart using non-sensitive test data.
10. Promote to production only after the checks pass.

## Incident response

If a secret is exposed: revoke or rotate it immediately, inspect relevant provider activity, replace it in private environment settings, redeploy, and document the incident without copying the secret into the report.

If login or API requests fail: inspect server logs and HTTP status codes, confirm proxy configuration, and check whether rate limits are being triggered. Do not disable authentication, CSRF, or rate limiting as a workaround.

## Capability boundaries

The dashboard and API must describe actual runtime capabilities. A planned integration is not a connected integration. An approval record is not an executed action. Trading remains simulation-only unless a separately reviewed and explicitly authorized execution system is implemented.
