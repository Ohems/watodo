import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  organizationParamsSchema,
  tableQuerySchema,
  teamMemberSchema,
  teamPushSchema,
  teamUpdateSchema,
} from '../schemas/index.js';
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
} from '../services/team-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface TeamParams {
  Params: { organizationId: string; teamId: string };
}

interface MemberParams {
  Params: { organizationId: string; teamId: string; userId: string };
}

export async function listTeamsHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listTeams(organizationId, query);
  return reply.status(200).send(result);
}

export async function getTeamHandler(
  request: FastifyRequest<TeamParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId } = request.params;
  const team = await getTeam(teamId);
  return reply.status(200).send(team);
}

export async function createTeamHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = teamPushSchema.parse(request.body);
  const team = await createTeam(data);
  return reply.status(200).send(team);
}

export async function updateTeamHandler(
  request: FastifyRequest<TeamParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId } = request.params;
  const data = teamUpdateSchema.parse(request.body);
  const team = await updateTeam(teamId, data);
  return reply.status(200).send(team);
}

export async function deleteTeamHandler(
  request: FastifyRequest<TeamParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId } = request.params;
  await deleteTeam(teamId);
  return reply.status(200).send({ success: true });
}

export async function listTeamMembersHandler(
  request: FastifyRequest<TeamParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId } = request.params;
  const members = await listTeamMembers(teamId);
  return reply.status(200).send(members);
}

export async function addTeamMemberHandler(
  request: FastifyRequest<TeamParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId } = request.params;
  const data = teamMemberSchema.parse(request.body);
  const member = await addTeamMember(teamId, data);
  return reply.status(200).send(member);
}

export async function removeTeamMemberHandler(
  request: FastifyRequest<MemberParams>,
  reply: FastifyReply,
): Promise<void> {
  const { teamId, userId } = request.params;
  await removeTeamMember(teamId, userId);
  return reply.status(200).send({ success: true });
}
