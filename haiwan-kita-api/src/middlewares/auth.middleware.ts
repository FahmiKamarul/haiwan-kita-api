import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { prisma } from '../config/prisma';

// ── JWT Payload type ─────────────────────────────────────────────
export interface JwtPayload {
  sub: string;     // user ID
  email: string;
  role: Role;
  iat?: number;    // set automatically by JWT library on sign
  exp?: number;    // set automatically by JWT library on sign
}

// Use @fastify/jwt's own extension point to type request.user correctly
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// ── authenticate ─────────────────────────────────────────────────
/**
 * Verifies the Bearer JWT and attaches the decoded payload to request.user.
 * Throws 401 if missing or invalid.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;

    // Ensure user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'Account not found or has been deactivated.');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Invalid or expired token. Please log in again.');
  }
}

// ── requireRole ──────────────────────────────────────────────────
/**
 * Factory that returns a preHandler hook allowing only specific roles.
 * Must be used AFTER authenticate.
 */
export function requireRole(...roles: Role[]) {
  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const user = request.user as JwtPayload;
    if (!roles.includes(user.role)) {
      throw new AppError(
        403,
        `Access denied. Required role(s): ${roles.join(', ')}.`,
      );
    }
  };
}
