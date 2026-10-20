import { disconnectDatabase } from '../src/database.js';
import { createLogger } from '../src/logger.js';
import { ALL_PERMISSIONS } from '../src/permissions.js';
import { seedPermissions } from '../src/services/permission-service.js';

const logger = createLogger('seed-permissions');

async function main(): Promise<void> {
  try {
    const inserted = await seedPermissions();
    if (inserted === 0) {
      logger.info(`All ${ALL_PERMISSIONS.length} permissions are already seeded.`);
    } else {
      logger.info(`Seeded ${inserted} of ${ALL_PERMISSIONS.length} permissions.`);
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to seed permissions');
  process.exit(1);
});
