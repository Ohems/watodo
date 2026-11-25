import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logEnabled: process.env.LOG_ENABLED !== 'false',
  databaseUrl: process.env.DATABASE_URL ?? '',
  // Pending database migrations are applied automatically at startup unless
  // AUTO_MIGRATE is explicitly set to 'false'.
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  discordClientId: process.env.DISCORD_CLIENT_ID ?? '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  // Critical-slot alert job: look-ahead window in days and run interval in minutes.
  criticalSlotAlertDays: Number.parseInt(process.env.CRITICAL_SLOT_ALERT_DAYS ?? '7', 10),
  criticalSlotAlertIntervalMinutes: Number.parseInt(
    process.env.CRITICAL_SLOT_ALERT_INTERVAL_MINUTES ?? '60',
    10,
  ),
  // Web push (VAPID) configuration. Generate a pair once with
  // `npx web-push generate-vapid-keys`. When empty, push delivery is disabled.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  // Email delivery. MAIL_PROVIDER selects the mail backend (see
  // services/mail-providers/); empty or unknown disables email delivery.
  // MAIL_FROM is the sender address and must be verified at the provider.
  mailProvider: process.env.MAIL_PROVIDER ?? '',
  mailFrom: process.env.MAIL_FROM ?? '',
  // Public URL of the web app, used for links inside notification emails.
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  // Per-provider credentials; only the selected provider's are needed.
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  mailgunApiKey: process.env.MAILGUN_API_KEY ?? '',
  mailgunDomain: process.env.MAILGUN_DOMAIN ?? '',
  mailgunRegion: process.env.MAILGUN_REGION ?? 'us',
  usesendApiKey: process.env.USESEND_API_KEY ?? '',
  // Points at a self-hosted useSend instance instead of the cloud API.
  usesendBaseUrl: process.env.USESEND_BASE_URL ?? 'https://api.usesend.com',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number.parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
} as const;

export type Config = typeof config;
