import { FastifyInstance } from 'fastify';
import {
  listMissions,
  getMission,
  join,
  leave,
  verifyMissionAttendance,
  createMissionHandler,
  approveMissionHandler,
  rejectMissionHandler,
  concludeMissionHandler,
  getParticipantsHandler,
  getMyMissionsHandler,
} from '../controllers/mission.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';

export async function missionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/missions — authenticated (Penapisan Pintar)
  fastify.get('/', {
    preHandler: [authenticate],
    handler: listMissions,
  });

  // GET /api/v1/missions/my-missions — VOLUNTEER or MEMBER: their own participated missions
  // Must be registered BEFORE /:id to avoid being matched as a param
  fastify.get('/my-missions', {
    preHandler: [authenticate, requireRole('VOLUNTEER', 'MEMBER')],
    handler: getMyMissionsHandler,
  });

  // GET /api/v1/missions/:id — authenticated
  fastify.get('/:id', {
    preHandler: [authenticate],
    handler: getMission,
  });

  // GET /api/v1/missions/:id/participants — MEMBER / ADMIN: full participant list
  fastify.get('/:id/participants', {
    preHandler: [authenticate, requireRole('MEMBER', 'ADMIN')],
    handler: getParticipantsHandler,
  });

  // POST /api/v1/missions/join — authenticated (Volunteer or Member)
  fastify.post('/join', {
    preHandler: [authenticate, requireRole('VOLUNTEER', 'MEMBER')],
    handler: join,
  });

  // POST /api/v1/missions/leave — Volunteer or Member cancels their registration
  fastify.post('/leave', {
    preHandler: [authenticate, requireRole('VOLUNTEER', 'MEMBER')],
    handler: leave,
  });

  // POST /api/v1/missions/verify-attendance — Member only
  fastify.post('/verify-attendance', {
    preHandler: [authenticate, requireRole('MEMBER', 'ADMIN')],
    handler: verifyMissionAttendance,
  });

  // POST /api/v1/missions — Propose a new mission (MEMBER only)
  fastify.post('/', {
    preHandler: [authenticate, requireRole('MEMBER')],
    handler: createMissionHandler,
  });

  // POST /api/v1/missions/:id/approve — Admin approves → state ACTIVE
  fastify.post('/:id/approve', {
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: approveMissionHandler,
  });

  // POST /api/v1/missions/:id/reject — Admin rejects → state CANCELLED
  fastify.post('/:id/reject', {
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: rejectMissionHandler,
  });

  // POST /api/v1/missions/:id/conclude — Member concludes → state COMPLETED
  fastify.post('/:id/conclude', {
    preHandler: [authenticate, requireRole('MEMBER')],
    handler: concludeMissionHandler,
  });
}
