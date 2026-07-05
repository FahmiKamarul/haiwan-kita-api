import { FastifyRequest, FastifyReply } from 'fastify';
import { submitReview, SubmitReviewSchema, getProjectReviews, getAdminReviewStats } from '../services/review.service';

export async function submitReviewHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: any }>,
  reply: FastifyReply
) {
  const projectId = request.params.id;
  const userId = request.user.sub;

  const parsed = SubmitReviewSchema.parse(request.body);
  const review = await submitReview(userId, projectId, parsed);

  return reply.status(201).send({
    success: true,
    message: 'Maklum balas berjaya dihantar!',
    review,
  });
}

export async function getProjectReviewsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const projectId = request.params.id;
  const result = await getProjectReviews(projectId);

  return reply.send({
    success: true,
    data: result,
  });
}

export async function getAdminReviewStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const stats = await getAdminReviewStats();

  return reply.send({
    success: true,
    data: stats,
  });
}
