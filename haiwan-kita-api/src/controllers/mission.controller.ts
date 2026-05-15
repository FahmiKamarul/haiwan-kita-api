import { FastifyRequest, FastifyReply } from 'fastify';
import {
  missionQuerySchema,
  joinMissionSchema,
  verifyAttendanceSchema,
  createMissionSchema,
} from '../schemas/mission.schema';
import {
  getMissions,
  getMissionById,
  joinMission,
  createMission,
  updateMissionState,
  leaveMission,
  getMissionParticipants,
  getMyMissions,
} from '../services/mission.service';
import { verifyAttendance } from '../services/attendance.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

// ── Mission Controller ───────────────────────────────────────────

export async function listMissions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = missionQuerySchema.parse(request.query);
  const data = await getMissions(query);
  successResponse(reply, data, 'Missions retrieved successfully.');
}

export async function getMission(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  // Pass user id so the response includes isJoined for the current user
  const userId = request.user?.sub;
  const data = await getMissionById(id, userId);
  successResponse(reply, data);
}

export async function leave(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = joinMissionSchema.parse(request.body); // reuse same { projectId } shape
  const data = await leaveMission(user.sub, input.projectId);
  successResponse(reply, data, data.message);
}

export async function join(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = joinMissionSchema.parse(request.body);
  const data = await joinMission(user.sub, input);
  successResponse(reply, data, 'Joined mission successfully.', 201);
}

// ── Attendance Controller ────────────────────────────────────────

export async function verifyMissionAttendance(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = verifyAttendanceSchema.parse(request.body);
  const data = await verifyAttendance(user.sub, input);
  successResponse(reply, data, 'Attendance verified.');
}

// ── Create Mission Controller ────────────────────────────────────

export async function createMissionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = createMissionSchema.parse(request.body);
  const data = await createMission(user.sub, input);
  successResponse(reply, data, 'Mission proposal submitted successfully.', 201);
}

// ── Approve / Reject Mission Controllers (ADMIN only) ────────────────────

export async function approveMissionHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const data = await updateMissionState(user.sub, request.params.id, 'ACTIVE');
  successResponse(reply, data, data.message);
}

export async function rejectMissionHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const { reason } = (request.body as { reason?: string }) ?? {};
  const data = await updateMissionState(user.sub, request.params.id, 'CANCELLED', reason);
  successResponse(reply, data, data.message);
}

// ── GET /api/v1/missions/:id/participants — MEMBER / ADMIN only ──────────────

export async function getParticipantsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const data = await getMissionParticipants(id);
  successResponse(reply, data, `${data.length} participant(s) found.`);
}

// ── GET /api/v1/missions/my-missions — VOLUNTEER only ───────────────────────

export async function getMyMissionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const data = await getMyMissions(user.sub);
  successResponse(reply, data, 'Your missions retrieved successfully.');
}
