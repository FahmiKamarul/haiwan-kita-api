import { FastifyRequest, FastifyReply } from 'fastify';
import { locationUpdateSchema } from '../schemas/location.schema';
import {
  updateLocation,
  getUserLocationHistory,
  getActiveStreamers,
} from '../services/location.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

// ── Location Controller ─────────────────────────────────────────

export async function postLocationUpdate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');

  const input = locationUpdateSchema.parse(request.body);
  const data = await updateLocation(user.sub, input);
  successResponse(reply, data, data.status, 200);
}

export async function getLocationHistory(
  request: FastifyRequest<{ Querystring: { projectId?: string; limit?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');

  const { projectId, limit } = request.query;
  const data = await getUserLocationHistory(
    user.sub,
    projectId,
    limit ? parseInt(limit, 10) : undefined,
  );
  successResponse(reply, data, 'Location history retrieved.');
}

export async function getProjectActiveStreamers(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { projectId } = request.params;
  const data = await getActiveStreamers(projectId);
  successResponse(reply, { streamers: data, count: data.length });
}
