import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import { successResponse } from '../utils/response';

export async function getUsersByRole(
  request: FastifyRequest<{ Querystring: { role?: Role } }>,
  reply: FastifyReply,
): Promise<void> {
  const { role } = request.query;
  const whereClause = role ? { role } : {};

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
      volunteerProfile: true,
      memberProfile: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  successResponse(reply, users, 'Users retrieved successfully.');
}
