import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    trustProxy: true,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  await app.register(cookie);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Watodo API Documentation',
        version: '1.0.0',
      },
      servers: [{ url: config.baseUrl }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation error',
        statusCode: 400,
        details: error.issues,
      });
    }

    const statusCode = error.statusCode ?? 500;
    logger.error({ err: error, url: request.url }, 'Request error');
    return reply.status(statusCode).send({
      error: error.message || 'Internal Server Error',
      statusCode,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({ error: 'Not Found', path: request.url });
  });

  await registerRoutes(app);

  return app;
}
