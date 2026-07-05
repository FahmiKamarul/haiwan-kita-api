import { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../middlewares/auth.middleware';
import { submitReviewHandler, getProjectReviewsHandler, getAdminReviewStatsHandler } from '../controllers/review.controller';

export async function reviewRoutes(fastify: FastifyInstance) {
  // Submit a review (Volunteer)
  fastify.post<{ Params: { id: string }; Body: any }>(
    '/missions/:id/reviews',
    { preHandler: [authenticate, requireRole('VOLUNTEER')] },
    submitReviewHandler
  );

  // Get all reviews for a specific project
  fastify.get<{ Params: { id: string } }>(
    '/missions/:id/reviews',
    { preHandler: [authenticate] },
    getProjectReviewsHandler
  );

  // Admin stats route
  fastify.get(
    '/admin/reviews/stats',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getAdminReviewStatsHandler
  );
}
