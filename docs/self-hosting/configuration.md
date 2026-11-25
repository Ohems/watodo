# Configuration

All configuration is done with environment variables loaded from `.env` files
(dotenv). The backend runs with `backend/` as its working directory and loads
`backend/.env`. Copy `.env.sample` to both the repo root and `backend/`.
Variables already present in the process environment take precedence over the
`.env` file (dotenv does not override them).

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `PORT` | `3000` | Backend listen port |
| `HOST` | `0.0.0.0` | Backend bind address |
| `LOG_ENABLED` | `true` | Set to `false` to silence all logging |
| `LOG_LEVEL` | `info` | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `DATABASE_URL` | `postgres://watodo:dbPass123@localhost:5432/watodo` | PostgreSQL connection string |
| `AUTO_MIGRATE` | `true` | Apply pending database migrations automatically at backend startup; set to `false` to run them manually instead |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `BASE_URL` | `http://localhost:3000` | Public URL of the backend; used to build OAuth redirect URLs |
| `APP_URL` | `http://localhost:5173` | Public URL of the web app; used for links inside notification emails |

## Scheduled jobs

| Variable | Default | Description |
|----------|---------|-------------|
| `CRITICAL_SLOT_ALERT_DAYS` | `7` | Notify series managers about occurrences within this many days that still have unfilled critical slots |
| `CRITICAL_SLOT_ALERT_INTERVAL_MINUTES` | `60` | How often that check runs |

## OAuth login providers (optional)

Set BOTH the id and the secret to enable a provider; the login page only shows
providers that are configured.

| Provider | Variables | Where to create the app |
|----------|-----------|-------------------------|
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | https://discord.com/developers/applications |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com/apis/credentials (OAuth client) |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | https://entra.microsoft.com (App registrations) |

See [OAuth login providers](/self-hosting/oauth-providers) for the redirect URIs.

## Email notifications (optional)

Email delivery stays disabled while `MAIL_PROVIDER` is unset.

| Variable | Description |
|----------|-------------|
| `MAIL_PROVIDER` | `resend`, `mailgun`, `usesend` or `smtp` |
| `MAIL_FROM` | Sender address; must be verified at the provider, e.g. `"Watodo <notifications@example.com>"` |
| `RESEND_API_KEY` | Resend (https://resend.com) API key from the dashboard |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` | Mailgun API key and sending domain; region `us` (default) or `eu` |
| `USESEND_API_KEY`, `USESEND_BASE_URL` | useSend; point `USESEND_BASE_URL` at a self-hosted instance (default `https://api.usesend.com`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Plain SMTP via nodemailer |

## Web push notifications (optional)

Push delivery stays disabled while the VAPID keys are unset. Generate a key pair
once (run from `backend/`):

```bash
npx web-push generate-vapid-keys
```

Then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a contact for
the push service, usually a `mailto:` address).
