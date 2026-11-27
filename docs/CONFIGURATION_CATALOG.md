# ULTRON configuration & credential catalog

This is the central inventory for the later credential-setup session. **Never paste credentials into ChatGPT, GitHub files, browser code, or screenshots.** Add them only as private environment variables in Render → ULTRON service → Environment.

## Current core

| Variable | Required | Purpose |
|---|---:|---|
| `ULTRON_SETUP_KEY` | First deployment | One-time first administrator setup |
| `ULTRON_SESSION_SECRET` | Production | Session signing; unique random value, minimum 32 characters |
| `DATABASE_URL` | Production | Persistent PostgreSQL storage |
| `ULTRON_TOKEN_ENCRYPTION_KEY` | Google OAuth | AES-256-GCM token encryption; minimum 32 characters |
| `OPENAI_API_KEY` | Optional | Enables ULTRON Chat |
| `OPENAI_MODEL` | Optional | Model override; current default is `gpt-6.2-astra` |

## Google (implemented, read-only)

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. The callback must exactly match:
`https://YOUR-ULTRON-HOST/api/integrations/google/callback`.
Gmail and Calendar scopes are read-only: no email sending or calendar editing.

## YouTube (planned — do not create credentials yet)

The future connector needs a YouTube-specific OAuth consent flow and scopes. `YOUTUBE_REDIRECT_URI` is only a reserved placeholder; it is not consumed by this release. Do not create or upload additional YouTube credentials until the connector is implemented.

## WhatsApp Business Cloud API (planned — official Meta API only)

Reserved variables: `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`. No WhatsApp route is active yet; do not upload these values until webhook validation and the connector are implemented.

## Research and financial data

No provider has been selected, so no provider-specific keys are requested. Trading remains simulation-only; do not upload broker execution credentials.

## Platform settings

Use `NODE_ENV=production`, `HOST=0.0.0.0`, Render-provided `PORT`, and `TRUST_PROXY=true` only behind a trusted reverse proxy. Render may generate session, setup, and token-encryption secrets through the Blueprint. Never commit `.env`; rotate any exposed credential.

## Safe visibility

Authenticated `GET /api/system/configuration` returns variable names, purpose, required/optional status, and configured/not-configured indicators only. It never returns environment values.
