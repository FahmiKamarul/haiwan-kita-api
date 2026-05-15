import { FastifyInstance } from 'fastify';
import {
  postLocationUpdate,
  getLocationHistory,
  getProjectActiveStreamers,
} from '../controllers/location.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';

export async function locationRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/location/update — Volunteer or Member (background GPS ping from RN app)
  fastify.post('/update', {
    preHandler: [authenticate, requireRole('VOLUNTEER', 'MEMBER')],
    handler: postLocationUpdate,
  });

  // GET /api/v1/location/history — own location history
  fastify.get('/history', {
    preHandler: [authenticate],
    handler: getLocationHistory,
  });

  // GET /api/v1/location/project/:projectId/streamers — Admin only
  fastify.get('/project/:projectId/streamers', {
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: getProjectActiveStreamers,
  });
}
