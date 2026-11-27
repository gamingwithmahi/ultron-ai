# Security Notes

## Current controls

- Helmet security headers and restrictive content security policy
- API request-size limit and rate limiting
- Separate rate limiting for authentication endpoints
- scrypt password hashing with random salt
- Timing-safe comparisons for secrets and hashes
- HTTP-only, SameSite=Strict session cookie
- CSRF header token for authenticated state changes
- Production startup requires a 32+ character session-signing secret
- No credentials are stored in source control\n- AI provider key is read only by the backend environment\n- Chat API is authenticated, CSRF-protected, rate-limited, and has no tool execution

## Operator responsibilities

1. Use HTTPS and a unique administrator password.
2. Keep setup and session secrets in host environment variables.
3. Remove or rotate the first-run setup secret after provisioning.
4. Keep persistent disk backups encrypted and access controlled.
5. Do not expose a development server directly to the public internet.

## Not yet implemented

Multi-user roles, MFA, account recovery, database-backed session revocation, distributed rate limiting, encrypted connector-token vault, automated dependency scanning, and external-action execution sandbox. Do not treat this foundation as a completed security audit.
