import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  organizationParamsSchema,
  siteParamsSchema,
  sitePushSchema,
  siteUpdateSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  createSite,
  deleteSite,
  getSite,
  listAllSites,
  listSites,
  updateSite,
} from '../services/site-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface SiteParams {
  Params: { organizationId: string; siteId: string };
}

export async function listSitesHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listSites(organizationId, query);
  return reply.status(200).send(result);
}

export async function listAllSitesHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const sites = await listAllSites(organizationId);
  return reply.status(200).send(sites);
}

export async function getSiteHandler(
  request: FastifyRequest<SiteParams>,
  reply: FastifyReply,
): Promise<void> {
  const { siteId } = siteParamsSchema.parse(request.params);
  const site = await getSite(siteId);
  return reply.status(200).send(site);
}

export async function createSiteHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = sitePushSchema.parse(request.body);
  const site = await createSite(data);
  return reply.status(200).send(site);
}

export async function updateSiteHandler(
  request: FastifyRequest<SiteParams>,
  reply: FastifyReply,
): Promise<void> {
  const { siteId } = siteParamsSchema.parse(request.params);
  const data = siteUpdateSchema.parse(request.body);
  const site = await updateSite(siteId, data);
  return reply.status(200).send(site);
}

export async function deleteSiteHandler(
  request: FastifyRequest<SiteParams>,
  reply: FastifyReply,
): Promise<void> {
  const { siteId } = siteParamsSchema.parse(request.params);
  await deleteSite(siteId);
  return reply.status(200).send({ success: true });
}
