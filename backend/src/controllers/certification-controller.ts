import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  certificationPushSchema,
  certificationUpdateSchema,
  organizationParamsSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  createCertification,
  deleteCertification,
  getCertification,
  listAllCertifications,
  listCertifications,
  updateCertification,
} from '../services/certification-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface CertificationParams {
  Params: { organizationId: string; certificationId: string };
}

function parseCertificationId(value: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid certification ID: ${value}`);
  }
  return id;
}

export async function listCertificationsHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listCertifications(organizationId, query);
  return reply.status(200).send(result);
}

export async function listAllCertificationsHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const certs = await listAllCertifications(organizationId);
  return reply.status(200).send(certs);
}

export async function getCertificationHandler(
  request: FastifyRequest<CertificationParams>,
  reply: FastifyReply,
): Promise<void> {
  const certificationId = parseCertificationId(request.params.certificationId);
  const cert = await getCertification(certificationId);
  return reply.status(200).send(cert);
}

export async function createCertificationHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = certificationPushSchema.parse(request.body);
  const cert = await createCertification(data);
  return reply.status(200).send(cert);
}

export async function updateCertificationHandler(
  request: FastifyRequest<CertificationParams>,
  reply: FastifyReply,
): Promise<void> {
  const certificationId = parseCertificationId(request.params.certificationId);
  const data = certificationUpdateSchema.parse(request.body);
  const cert = await updateCertification(certificationId, data);
  return reply.status(200).send(cert);
}

export async function deleteCertificationHandler(
  request: FastifyRequest<CertificationParams>,
  reply: FastifyReply,
): Promise<void> {
  const certificationId = parseCertificationId(request.params.certificationId);
  await deleteCertification(certificationId);
  return reply.status(200).send({ success: true });
}
