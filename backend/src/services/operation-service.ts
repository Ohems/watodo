import { db } from '../database.js';
import type { OpAssignment } from '../db/types.js';
import { createLogger } from '../logger.js';
import type { OperationInput } from '../schemas/index.js';

const logger = createLogger('operation-service');

function throwNotFound(operationId: number): never {
  throw new Error(`Operation ${operationId} not found!`);
}

async function fetchOperationWithAssignments(
  executor: typeof db,
  operationId: number,
): Promise<(Record<string, unknown> & { assignments: OpAssignment[] }) | undefined> {
  const operation = await executor
    .selectFrom('operations')
    .selectAll()
    .where('id', '=', operationId)
    .executeTakeFirst();

  if (!operation) return undefined;

  const assignments = await executor
    .selectFrom('op_assignments')
    .selectAll()
    .where('operation_id', '=', operationId)
    .orderBy('id', 'asc')
    .execute();

  return { ...operation, assignments };
}

async function fetchAllOperationsWithAssignments(executor: typeof db) {
  const operations = await executor
    .selectFrom('operations')
    .selectAll()
    .orderBy('id', 'asc')
    .execute();

  const allAssignments = await executor
    .selectFrom('op_assignments')
    .selectAll()
    .orderBy('id', 'asc')
    .execute();

  return operations.map(op => ({
    ...op,
    assignments: allAssignments.filter(a => a.operation_id === op.id),
  }));
}

export async function getOperations() {
  logger.trace('operationService.getOperations');
  return fetchAllOperationsWithAssignments(db);
}

export async function getOperation(operationId: number) {
  logger.trace('operationService.getOperation');

  const operation = await fetchOperationWithAssignments(db, operationId);

  if (!operation) {
    throwNotFound(operationId);
  }

  return operation;
}

export async function upsertOperation(data: OperationInput) {
  logger.trace('operationService.upsertOperation');

  const { id, assignments, ...operationData } = data;

  if (id) {
    const existing = await db
      .selectFrom('operations')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      throwNotFound(id);
    }

    return db.transaction().execute(async tx => {
      await tx
        .updateTable('operations')
        .set({
          name: operationData.name,
          description: operationData.description ?? '',
          requirements: operationData.requirements ?? '',
          location: operationData.location ?? '',
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();

      if (assignments) {
        const existingAssignments = await tx
          .selectFrom('op_assignments')
          .selectAll()
          .where('operation_id', '=', id)
          .execute();

        const existingIds = new Set(existingAssignments.map(a => a.id));
        const incomingIds = new Set(assignments.filter(a => a.id).map(a => a.id as number));

        for (const existing of existingAssignments) {
          if (!incomingIds.has(existing.id)) {
            await tx.deleteFrom('op_assignments').where('id', '=', existing.id).execute();
          }
        }

        for (const assignment of assignments) {
          if (assignment.id && existingIds.has(assignment.id)) {
            await tx
              .updateTable('op_assignments')
              .set({
                name: assignment.name,
                description: assignment.description ?? '',
                updated_at: new Date(),
              })
              .where('id', '=', assignment.id)
              .execute();
          } else {
            await tx
              .insertInto('op_assignments')
              .values({
                operation_id: id,
                name: assignment.name,
                description: assignment.description ?? '',
              })
              .execute();
          }
        }
      }

      return fetchOperationWithAssignments(tx, id);
    });
  }

  return db.transaction().execute(async tx => {
    const operation = await tx
      .insertInto('operations')
      .values({
        name: operationData.name,
        description: operationData.description ?? '',
        requirements: operationData.requirements ?? '',
        location: operationData.location ?? '',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (assignments && assignments.length > 0) {
      await tx
        .insertInto('op_assignments')
        .values(
          assignments.map(a => ({
            operation_id: operation.id,
            name: a.name,
            description: a.description ?? '',
          })),
        )
        .execute();
    }

    return fetchOperationWithAssignments(tx, operation.id);
  });
}

export async function deleteOperation(operationId: number): Promise<void> {
  logger.trace('operationService.deleteOperation');

  const result = await db.deleteFrom('operations').where('id', '=', operationId).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throwNotFound(operationId);
  }
}

export async function upsertOpAssignment(
  operationId: number,
  assignmentId: number | undefined,
  data: { name: string; description?: string },
) {
  logger.trace('operationService.upsertOpAssignment');

  const operation = await db
    .selectFrom('operations')
    .select('id')
    .where('id', '=', operationId)
    .executeTakeFirst();

  if (!operation) {
    throwNotFound(operationId);
  }

  if (assignmentId) {
    return db
      .updateTable('op_assignments')
      .set({
        name: data.name,
        description: data.description ?? '',
        updated_at: new Date(),
      })
      .where('id', '=', assignmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return db
    .insertInto('op_assignments')
    .values({
      operation_id: operationId,
      name: data.name,
      description: data.description ?? '',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteOpAssignment(operationId: number, assignmentId: number): Promise<void> {
  logger.trace('operationService.deleteOpAssignment');

  const assignment = await db
    .selectFrom('op_assignments')
    .selectAll()
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment || assignment.operation_id !== operationId) {
    throw new Error(`Assignment ${assignmentId} not found in operation ${operationId}!`);
  }

  await db.deleteFrom('op_assignments').where('id', '=', assignmentId).execute();
}
