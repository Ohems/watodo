import { db } from '../database.js';
import type { Job } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { JobPush, JobUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('job-service');

export interface JobResponse {
  id: number;
  name: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedJobs {
  items: JobResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeJob(job: Job): JobResponse {
  return {
    id: job.id,
    name: job.name,
    organizationId: job.organization_id,
    createdAt: job.created_at.toISOString(),
    updatedAt: job.updated_at.toISOString(),
  };
}

/**
 * Lists jobs in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated jobs.
 */
export async function listJobs(
  organizationId: string,
  query: TableQuery = {},
): Promise<PaginatedJobs> {
  logger.trace('jobService.listJobs');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db.selectFrom('jobs').selectAll().where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('jobs')
    .select(db.fn.countAll().as('count'))
    .where('organization_id', '=', organizationId);

  if (search) {
    baseQuery = baseQuery.where('name', 'ilike', `%${search}%`);
    countQuery = countQuery.where('name', 'ilike', `%${search}%`);
  }

  const [rows, countRow] = await Promise.all([
    baseQuery
      .orderBy('name', 'asc')
      .limit(limit)
      .offset(page * limit)
      .execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  return {
    items: rows.map(serializeJob),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all jobs in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @returns All jobs.
 */
export async function listAllJobs(organizationId: string): Promise<JobResponse[]> {
  logger.trace('jobService.listAllJobs');
  const rows = await db
    .selectFrom('jobs')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(serializeJob);
}

/**
 * Gets a single job.
 * @param jobId - The job ID.
 * @returns The job.
 */
export async function getJob(jobId: number): Promise<JobResponse> {
  logger.trace('jobService.getJob');
  const job = await db.selectFrom('jobs').selectAll().where('id', '=', jobId).executeTakeFirst();
  if (!job) {
    throw notFound(`Job ${jobId} not found!`);
  }
  return serializeJob(job);
}

/**
 * Creates a new job.
 * @param data - The job data.
 * @returns The created job.
 */
export async function createJob(data: JobPush): Promise<JobResponse> {
  logger.trace('jobService.createJob');
  const job = await db
    .insertInto('jobs')
    .values({
      name: data.name,
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeJob(job);
}

/**
 * Updates a job.
 * @param jobId - The job ID.
 * @param data - The fields to update.
 * @returns The updated job.
 */
export async function updateJob(jobId: number, data: JobUpdate): Promise<JobResponse> {
  logger.trace('jobService.updateJob');
  const updated = await db
    .updateTable('jobs')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', jobId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Job ${jobId} not found!`);
  }
  return serializeJob(updated);
}

/**
 * Deletes a job.
 * @param jobId - The job ID.
 */
export async function deleteJob(jobId: number): Promise<void> {
  logger.trace('jobService.deleteJob');
  const result = await db.deleteFrom('jobs').where('id', '=', jobId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Job ${jobId} not found!`);
  }
}
