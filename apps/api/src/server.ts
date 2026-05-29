import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fastifySwagger } from '@fastify/swagger';
import scalarApiReference from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import path from 'node:path';
import { ZodError } from 'zod';

import { env } from '@ravoxzap/config';
import { prisma } from '@ravoxzap/database';
import { createLogger } from '@ravoxzap/logger';
import { closeQueues, createQueues } from '@ravoxzap/queue';

import { AppError } from './errors/app-error.js';
import { registerRoutes } from './routes/index.js';

const logger = createLogger({ service: 'api' });
const app = Fastify({ logger: false });
const queues = createQueues(env.REDIS_URL);

app.register(cors, {
  origin: true,
});

app.register(jwt, {
  secret: env.JWT_SECRET,
});

app.register(multipart, {
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
  },
});

app.register(fastifyStatic, {
  root: path.resolve(process.cwd(), '../../storage/media'),
  prefix: '/media/',
  decorateReply: false,
});

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'RavoxZap API',
      version: '0.1.0',
    },
    components: {
      securitySchemes: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  },
});

app.get('/docs/json', async () => app.swagger());
app.register(scalarApiReference, {
  routePrefix: '/docs',
  configuration: {
    spec: { url: '/docs/json' },
  },
});

app.get('/health', async () => ({
  ok: true,
  service: 'ravoxzap-api',
  time: new Date().toISOString(),
}));

registerRoutes(app, queues, env);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      message: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      message: 'Invalid request payload',
      code: 'VALIDATION_ERROR',
      details: error.issues,
    });
    return;
  }

  const requestBodyError = error as { code?: string; message?: string };

  if (
    requestBodyError.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
    requestBodyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
    requestBodyError.message === 'Request body size did not match Content-Length'
  ) {
    reply.status(400).send({
      message: requestBodyError.message,
      code: 'INVALID_REQUEST_BODY',
    });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error('Unhandled API error', {
    errorMessage,
    stack,
  });

  reply.status(500).send({
    message: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Shutting down API', { signal });
  await app.close();
  await closeQueues(queues);
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', signal => void shutdown(signal));
process.once('SIGINT', signal => void shutdown(signal));

app
  .listen({ host: '0.0.0.0', port: env.PORT })
  .then(() => logger.info('API listening', { port: env.PORT }))
  .catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('API failed to start', { errorMessage });
    process.exit(1);
  });
