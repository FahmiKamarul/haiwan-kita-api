import { FastifyRequest, FastifyReply } from 'fastify';
import { reviewService } from '../services/review.service';
import { attendanceService } from '../services/attendance.service';

export const submitReviewHandler = async (
  request: FastifyRequest<{
    Params: { id: string };
    Body: {
      ratingManagement: number;
      ratingSafety: number;
      ratingImpact: number;
      ratingFacility: number;
      comment?: string;
    };
  }>,
  reply: FastifyReply
) => {
  const { id } = request.params;
  const userId = request.user.sub;

  // Volunteer can only review if project is completed (or certificate generated)
  // Let's just allow it if they were registered
  
  const review = await reviewService.createReview(id, userId, request.body);
  
  return reply.code(201).send({
    success: true,
    data: review,
  });
};

export const getMissionReviewsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const { id } = request.params;
  const data = await reviewService.getReviewsByMission(id);
  
  return reply.send({
    success: true,
    data,
  });
};

export const getAdminReviewStatsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const stats = await reviewService.getAdminStats();
  
  return reply.send({
    success: true,
    data: stats,
  });
};
