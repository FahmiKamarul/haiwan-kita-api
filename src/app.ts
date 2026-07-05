import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { errorHandler } from './utils/errorHandler';
import { authRoutes } from './routes/auth.routes';
import { missionRoutes } from './routes/mission.routes';
import { locationRoutes } from './routes/location.routes';
import { userRoutes } from './routes/user.routes';
import fastifyRawBody from 'fastify-raw-body';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { reviewRoutes } from './routes/review.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.server.env === 'production' ? 'warn' : 'info',
      transport:
        config.server.env !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Enforce <10s request timeout
    connectionTimeout: 10000,
  });

  // ── Raw Body Parsing for Stripe Webhooks ──────────────
  await fastify.register(fastifyRawBody, {
    field: 'rawBody', // the raw payload will be available on request.rawBody
    global: false,
    encoding: 'utf8',
    runFirst: true, // ensure it runs before normal parsers
  });

  // ── Security & CORS ───────────────────────────────────────────
  await fastify.register(helmet, { global: true });
  await fastify.register(cors, {
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── Rate Limiting ─────────────────────────────────────────────
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'You are sending requests too fast. Please slow down.',
      timestamp: new Date().toISOString(),
    }),
  });

  // ── JWT ───────────────────────────────────────────────────────
  await fastify.register(jwt, {
    secret: config.jwt.secret,
  });

  // ── Global Error Handler ──────────────────────────────────────
  fastify.setErrorHandler(errorHandler);

  // ── Health Check ──────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'haiwan-kita-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // ── Static Files (Certificates) ─────────────────────────────
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../certificates'),
    prefix: '/certificates/',
  });

  // ── Routes ────────────────────────────────────────────────────
  fastify.register(authRoutes, { prefix: '/auth' });
  fastify.register(missionRoutes, { prefix: '/api/v1/missions' });
  fastify.register(locationRoutes, { prefix: '/api/v1/location' });
  fastify.register(userRoutes, { prefix: '/api/v1/users' });
  fastify.register(reviewRoutes, { prefix: '/api/v1' });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} does not exist.`,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  });

  return fastify;
}
