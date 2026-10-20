import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from './config.js';
import type { Database } from './db/types.js';
import { createLogger } from './logger.js';

const logger = createLogger('database');

const { Pool } = pg;

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: config.databaseUrl,
      max: 10,
    }),
  }),
});

export async function connectDatabase(): Promise<void> {
  try {
    await db.selectFrom('users').select('id').limit(1).execute();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await db.destroy();
  logger.info('Database disconnected');
}
