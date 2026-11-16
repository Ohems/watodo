import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logEnabled: process.env.LOG_ENABLED !== 'false',
  databaseUrl: process.env.DATABASE_URL ?? '',
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
} as const;

export type Config = typeof config;
