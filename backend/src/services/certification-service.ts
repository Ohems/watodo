import { db } from '../database.js';
import type { Certification } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { CertificationPush, CertificationUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('certification-service');

export interface CertificationResponse {
  id: number;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCertifications {
  items: CertificationResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeCertification(cert: Certification): CertificationResponse {
  return {
    id: cert.id,
    name: cert.name,
    description: cert.description,
    organizationId: cert.organization_id,
    createdAt: cert.created_at.toISOString(),
    updatedAt: cert.updated_at.toISOString(),
  };
}

/**
 * Lists certifications in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated certifications.
 */
export async function listCertifications(
  organizationId: string,
  query: TableQuery = {},
): Promise<PaginatedCertifications> {
  logger.trace('certificationService.listCertifications');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db
    .selectFrom('certifications')
    .selectAll()
    .where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('certifications')
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
    items: rows.map(serializeCertification),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all certifications in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @returns All certifications.
 */
export async function listAllCertifications(
  organizationId: string,
): Promise<CertificationResponse[]> {
  logger.trace('certificationService.listAllCertifications');
  const rows = await db
    .selectFrom('certifications')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(serializeCertification);
}

/**
 * Gets a single certification.
 * @param certificationId - The certification ID.
 * @returns The certification.
 */
export async function getCertification(certificationId: number): Promise<CertificationResponse> {
  logger.trace('certificationService.getCertification');
  const cert = await db
    .selectFrom('certifications')
    .selectAll()
    .where('id', '=', certificationId)
    .executeTakeFirst();
  if (!cert) {
    throw notFound(`Certification ${certificationId} not found!`);
  }
  return serializeCertification(cert);
}

/**
 * Creates a new certification.
 * @param data - The certification data.
 * @returns The created certification.
 */
export async function createCertification(data: CertificationPush): Promise<CertificationResponse> {
  logger.trace('certificationService.createCertification');
  const cert = await db
    .insertInto('certifications')
    .values({
      name: data.name,
      description: data.description ?? '',
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeCertification(cert);
}

/**
 * Updates a certification.
 * @param certificationId - The certification ID.
 * @param data - The fields to update.
 * @returns The updated certification.
 */
export async function updateCertification(
  certificationId: number,
  data: CertificationUpdate,
): Promise<CertificationResponse> {
  logger.trace('certificationService.updateCertification');
  const updated = await db
    .updateTable('certifications')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', certificationId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Certification ${certificationId} not found!`);
  }
  return serializeCertification(updated);
}

/**
 * Deletes a certification.
 * @param certificationId - The certification ID.
 */
export async function deleteCertification(certificationId: number): Promise<void> {
  logger.trace('certificationService.deleteCertification');
  const result = await db
    .deleteFrom('certifications')
    .where('id', '=', certificationId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Certification ${certificationId} not found!`);
  }
}
