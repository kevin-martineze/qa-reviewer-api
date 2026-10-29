import 'reflect-metadata';
import 'dotenv/config';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { createAdapter } from './config/http';
import { startMemoryMongo } from './config/memory-mongo';
import { setupSwagger } from './shared/docs/swagger';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const env = loadEnv();

  if (env.MONGO_URI === 'memory') {
    const { uri } = await startMemoryMongo();
    env.MONGO_URI = uri;
    logger.warn('Mongo en memoria: los datos se pierden al detener el proceso.');
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    createAdapter(env),
    {
      logger: ['log', 'warn', 'error'],
    },
  );
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });
  const origins = env.CORS_ORIGINS.split(',').filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : [env.PUBLIC_WEB_URL] });
  setupSwagger(app);
  app.enableShutdownHooks();

  if (env.SEED === 'demo') {
    const { seedDemo } = await import('./seed/demo-seed');
    await seedDemo(app);
    logger.log('Semilla de demo cargada.');
  }

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(
    `API escuchando en el puerto ${env.PORT} · URL pública ${env.PUBLIC_API_URL} · documentación en ${env.PUBLIC_API_URL}/docs`,
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
