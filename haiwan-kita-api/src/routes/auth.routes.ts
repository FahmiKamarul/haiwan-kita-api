import { FastifyInstance } from 'fastify';
import { register, login, payMembership, getMe, updateProfile, updatePassword } from '../controllers/auth.controller';
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

  // PUT /auth/profile — authenticated
  fastify.put('/profile', {
    preHandler: [authenticate],
    handler: updateProfile,
  });

  // PUT /auth/password — authenticated
  fastify.put('/password', {
    preHandler: [authenticate],
    handler: updatePassword,
  });

  // POST /auth/pay-membership — Member only
  fastify.post('/pay-membership', {
    preHandler: [authenticate, requireRole('MEMBER')],
    handler: payMembership,
  });
}
