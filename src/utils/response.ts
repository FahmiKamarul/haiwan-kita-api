import { FastifyReply } from 'fastify';

export interface ApiSuccess<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

export function successResponse<T>(
  reply: FastifyReply,
  data: T,
  message = 'Success',
  statusCode = 200,
): void {
  const response: ApiSuccess<T> = {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  reply.status(statusCode).send(response);
}
