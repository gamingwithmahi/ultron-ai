# Security Policy

## Supported versions

Security fixes are applied to the actively maintained `main` branch. Older snapshots may not receive fixes; deploy only a revision that has passed the repository's automated checks.

## Reporting a vulnerability

Please do not publish exploit details, credentials, session cookies, private user data, or proof-of-concept attacks in a public issue.

Use GitHub's private vulnerability reporting for this repository when it is enabled. If private reporting is unavailable, contact the repository owner privately before sharing technical details publicly. Include:
- A concise impact description and affected revision
- Reproduction steps in a local, authorized environment
- Relevant logs with all secrets and personal data removed
- Any practical mitigation you have identified

Allow maintainers reasonable time to investigate and prepare a fix before public disclosure.

## Secret handling

- Never commit `.env`, API keys, OAuth client secrets, database URLs, encryption keys, session secrets, cookies, or production data.
- Rotate any credential that may have been exposed, even briefly.
- Use separate credentials for development and production.
- Keep production secrets in the hosting provider's private environment settings.
- Do not paste secrets into issues, pull requests, screenshots, chat, or logs.

## Security design requirements

- Authentication and authorization must be enforced server-side; hiding a UI control is not access control.
- State-changing requests must retain CSRF protection.
- Keep rate limits enabled and return structured, non-sensitive errors.
- Treat email, webpages, documents, model output, and connector payloads as untrusted input.
- AI tools must use explicit allowlists, least privilege, bounded inputs, and operator approval for consequential actions.
- Never allow model output to bypass authorization or approval checks.
- Keep financial execution, messaging, publishing, account changes, and destructive operations disabled until a separately reviewed execution boundary exists.
- Do not log passwords, tokens, authorization headers, session identifiers, or full sensitive prompts.

## Before a production release

Run `npm run check`, inspect the Git diff, verify environment configuration, confirm HTTPS and trusted-proxy settings, and test login, logout, CSRF rejection, rate limiting, backup/restore, and database persistence in a non-production environment.
