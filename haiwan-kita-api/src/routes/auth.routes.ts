import { FastifyInstance } from 'fastify';
import { register, login, payMembership, getMe } from '../controllers/auth.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /auth/register — public
  fastify.post('/register', register);

  // POST /auth/login — public
  fastify.post('/login', login);

  // GET /auth/me — authenticated
  fastify.get('/me', {
    preHandler: [authenticate],
    handler: getMe,
  });

  // POST /auth/pay-membership — Member only
  fastify.post('/pay-membership', {
    preHandler: [authenticate, requireRole('MEMBER')],
    handler: payMembership,
  });
}
