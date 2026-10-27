import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/database.js';
import { ALL_PERMISSIONS, PERMISSION_DEFINITIONS } from '../src/permissions.js';
import { seedPermissions } from '../src/services/permission-service.js';

// Integration test for the permissions seeding: verifies that the registry is
// inserted when the table is empty and that seeding is idempotent. The
// permissions table is re-seeded before and after each test, because the
// first test deletes it and other test files rely on the seeded rows.

describe('seedPermissions', () => {
  beforeEach(async () => {
    await seedPermissions();
  });

  afterEach(async () => {
    // Restore the seeded permissions in case the test removed them.
    await seedPermissions();
  });

  it('inserts every registry permission when the table is empty', async () => {
    await db.deleteFrom('permissions').execute();

    const inserted = await seedPermissions();

    expect(inserted).toBe(PERMISSION_DEFINITIONS.length);
    const rows = await db.selectFrom('permissions').select(['code', 'description']).execute();
    expect(rows.map(row => row.code).sort()).toEqual([...ALL_PERMISSIONS].sort());
    for (const row of rows) {
      const definition = PERMISSION_DEFINITIONS.find(def => def.code === row.code);
      expect(definition).toBeDefined();
      expect(row.description).toBe(definition?.description);
    }
  });

  it('is idempotent and leaves existing rows untouched', async () => {
    const before = await db.selectFrom('permissions').selectAll().orderBy('id', 'asc').execute();

    const inserted = await seedPermissions();

    expect(inserted).toBe(0);
    const after = await db.selectFrom('permissions').selectAll().orderBy('id', 'asc').execute();
    expect(after).toEqual(before);
  });
});
