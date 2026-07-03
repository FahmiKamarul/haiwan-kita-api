import { FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema, loginSchema, updateProfileSchema, updatePasswordSchema } from '../schemas/auth.schema';
import {
  registerUser,
  loginUser,
  processMemberPayment,
  updateUserProfile,
  updateUserPassword,
} from '../services/auth.service';
import { successResponse } from '../utils/response';
import { AppError } from '../utils/errorHandler';

// ── Auth Controller ─────────────────────────────────────────────

export async function register(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const input = registerSchema.parse(request.body);
  const data = await registerUser(input, request.server);
  successResponse(reply, data, 'Registration successful.', 201);
}

export async function login(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const input = loginSchema.parse(request.body);
  const data = await loginUser(input, request.server);
  successResponse(reply, data, 'Login successful.');
}

export async function payMembership(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  if (user.role !== 'MEMBER') {
    throw new AppError(403, 'Only Members need to pay membership fees.');
  }
  const data = await processMemberPayment(user.sub);
  successResponse(reply, data, 'Payment processed successfully.');
}

export async function getMe(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  successResponse(reply, {
    id: user.sub,
    email: user.email,
    role: user.role,
  });
}

export async function updateProfile(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = updateProfileSchema.parse(request.body);
  const data = await updateUserProfile(user.sub, input);
  successResponse(reply, data, 'Profile updated successfully.');
}

export async function updatePassword(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) throw new AppError(401, 'Unauthorized');
  const input = updatePasswordSchema.parse(request.body);
  const data = await updateUserPassword(user.sub, input);
  successResponse(reply, data, 'Password updated successfully.');
}
