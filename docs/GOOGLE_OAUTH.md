# Google account connection

ULTRON's first Google connector is read-only by design.

## Required server environment
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — exact HTTPS callback URL: `https://YOUR-ULTRON-HOST/api/integrations/google/callback`
- `ULTRON_TOKEN_ENCRYPTION_KEY` — a long random secret (at least 32 characters); Render Blueprint now generates this automatically

The application derives a 256-bit AES key from this secret using SHA-256. Render generates it as a private environment secret. Store it only in the hosting provider environment; never paste secrets into chat, commit them, or put them in browser code.

## Google Cloud setup
1. Open https://console.cloud.google.com/apis/credentials
2. Create/select a Google Cloud project and configure the OAuth consent screen.
3. Create an OAuth Client ID of type **Web application**.
4. Add the ULTRON public origin to Authorized JavaScript origins.
5. Add the exact `GOOGLE_REDIRECT_URI` to Authorized redirect URIs.
6. Enable Gmail API and Google Calendar API for the project.
7. Add the Gmail `gmail.readonly` and Calendar `calendar.readonly` scopes.
8. Keep the client secret private and add all four values to the ULTRON Render service environment.

## Security model
- Separate consent flows request only Gmail read-only or Calendar read-only scope.
- OAuth state is random, one-time, short-lived, and checked against an HttpOnly SameSite=Lax cookie and PostgreSQL record.
- Access and refresh tokens are encrypted with AES-256-GCM before storage.
- Disconnect revokes the Google token and deletes the encrypted token record.
- ULTRON does not send email, create/edit/delete events, or request write scopes in this release.
- OAuth requires PostgreSQL. Without it, the integration stays disabled.
