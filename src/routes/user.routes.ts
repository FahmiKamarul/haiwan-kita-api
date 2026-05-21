import { FastifyInstance } from 'fastify';
import { getUsersByRole } from '../controllers/user.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/users?role=VOLUNTEER — Admin only
  fastify.get('/', {
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: getUsersByRole,
  });
}
