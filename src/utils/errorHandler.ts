import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export interface ApiError {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const timestamp = new Date().toISOString();
  const path = request.url;

  // Zod validation errors
  if (error instanceof ZodError) {
    const response: ApiError = {
      success: false,
      statusCode: 422,
      error: 'Validation Error',
      message: 'Input validation failed. Please check your request data.',
      details: error.flatten().fieldErrors,
      timestamp,
      path,
    };
    reply.status(422).send(response);
    return;
  }

  // Custom application errors
  if (error instanceof AppError) {
    const response: ApiError = {
      success: false,
      statusCode: error.statusCode,
      error: getErrorName(error.statusCode),
      message: error.message,
      details: error.details,
      timestamp,
      path,
    };
    reply.status(error.statusCode).send(response);
    return;
  }

  // Fastify built-in errors (e.g. 404, method not allowed)
  if ('statusCode' in error && error.statusCode) {
    const statusCode = error.statusCode;
    const response: ApiError = {
      success: false,
      statusCode,
      error: getErrorName(statusCode),
      message: error.message,
      timestamp,
      path,
    };
    reply.status(statusCode).send(response);
    return;
  }

  // Unhandled / unexpected errors
  console.error('[Unhandled Error]', error);
  const response: ApiError = {
    success: false,
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.',
    timestamp,
    path,
  };
  reply.status(500).send(response);
}

function getErrorName(statusCode: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
  };
  return names[statusCode] ?? 'Error';
}
