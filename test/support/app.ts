// App completa contra Mongo en memoria con la semilla de demo (la misma del mock de la web).
// Cada archivo de pruebas levanta la suya: las pruebas de un archivo corren en orden y comparten datos.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/config/env';
import { startMemoryMongo } from '../../src/config/memory-mongo';
import { seedDemo } from '../../src/seed/demo-seed';

/** Usuarios de la demo (seed/demo/data.json). */
export const DEMO = {
  password: 'demo1234',
  /** member · developer en lideris, project_admin en auralis */
  kevin: 'kevin@ejemplo.co',
  /** admin · design_lead en lideris */
  laura: 'laura.rios@ejemplo.co',
  /** member · designer en lideris, developer en auralis */
  andres: 'andres.pena@ejemplo.co',
  /** member · designer solo en lideris */
  sofia: 'sofia.vargas@ejemplo.co',
  /** owner */
  valentina: 'valentina.ruiz@ejemplo.co',
} as const;

export interface Reply<T = unknown> {
  status: number;
  body: { messageKey?: string; data?: T; message?: string; details?: Record<string, unknown> };
}

export interface TestApp {
  app: NestFastifyApplication;
  login(email: string): Promise<string>;
  call<T = unknown>(
    method: string,
    url: string,
    token?: string,
    payload?: object,
  ): Promise<Reply<T>>;
  close(): Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const { replSet, uri } = await startMemoryMongo();
  const storageDir = await mkdtemp(join(tmpdir(), 'qa-api-test-'));
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGO_URI: uri,
    STORAGE_DIR: storageDir,
    MAIL_DRIVER: 'log',
    JOBS_ENABLED: 'false',
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter(),
    { logger: false, abortOnError: false },
  );
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await seedDemo(app);

  const call: TestApp['call'] = async (method, url, token, payload) => {
    const res = await app.inject({
      method: method as 'GET',
      url: `/v1${url}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
    });
    return { status: res.statusCode, body: res.body ? res.json() : {} };
  };

  const tokens = new Map<string, string>();
  const login = async (email: string) => {
    const cached = tokens.get(email);
    if (cached) return cached;
    const res = await call<{ token: string }>('POST', '/auth/login', undefined, {
      email,
      password: DEMO.password,
    });
    const token = res.body.data?.token;
    if (res.status !== 200 || !token) throw new Error(`Login falló para ${email}: ${res.status}`);
    tokens.set(email, token);
    return token;
  };

  return { app, call, login, close: () => stop(app, replSet, storageDir) };
}

async function stop(
  app: NestFastifyApplication,
  replSet: MongoMemoryReplSet,
  storageDir: string,
): Promise<void> {
  await app.close();
  await replSet.stop();
  await rm(storageDir, { recursive: true, force: true });
}
