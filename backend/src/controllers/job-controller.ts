import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  jobPushSchema,
  jobUpdateSchema,
  organizationParamsSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  createJob,
  deleteJob,
  getJob,
  listAllJobs,
  listJobs,
  updateJob,
} from '../services/job-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface JobParams {
  Params: { organizationId: string; jobId: string };
}

function parseJobId(value: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid job ID: ${value}`);
  }
  return id;
}

export async function listJobsHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listJobs(organizationId, query);
  return reply.status(200).send(result);
}

export async function listAllJobsHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const jobs = await listAllJobs(organizationId);
  return reply.status(200).send(jobs);
}

export async function getJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  const jobId = parseJobId(request.params.jobId);
  const job = await getJob(jobId);
  return reply.status(200).send(job);
}

export async function createJobHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = jobPushSchema.parse(request.body);
  const job = await createJob(data);
  return reply.status(200).send(job);
}

export async function updateJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  const jobId = parseJobId(request.params.jobId);
  const data = jobUpdateSchema.parse(request.body);
  const job = await updateJob(jobId, data);
  return reply.status(200).send(job);
}

export async function deleteJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  const jobId = parseJobId(request.params.jobId);
  await deleteJob(jobId);
  return reply.status(200).send({ success: true });
}
