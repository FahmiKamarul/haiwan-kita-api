import { FastifyInstance } from 'fastify';
import { submitReviewHandler, getMissionReviewsHandler, getAdminReviewStatsHandler } from '../controllers/review.controller';
import { authenticate, requireRole } from '../middlewares/auth.middleware';

export async function reviewRoutes(fastify: FastifyInstance) {
  // Admin stats route (must be before /:id routes to avoid parameter matching issues)
  fastify.get(
    '/admin/reviews/stats',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getAdminReviewStatsHandler
  );

  // Submit review (Volunteer)
  fastify.post<{ Params: { id: string }, Body: any }>(
    '/:id/reviews',
    { preHandler: [authenticate, requireRole('VOLUNTEER')] },
    submitReviewHandler
  );

  // Get reviews (Member/Admin)
  fastify.get<{ Params: { id: string } }>(
    '/:id/reviews',
    { preHandler: [authenticate] },
    getMissionReviewsHandler
  );
}
