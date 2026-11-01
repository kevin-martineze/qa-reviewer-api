// El contrato en un archivo estable (`openapi.json`): el front genera sus tipos de ahí.
// JSON con 2 espacios, sin Prettier (está en .prettierignore): lo escribe solo el script.
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import { loadEnv } from '../../config/env';
import { createAdapter } from '../../config/http';

import { buildOpenApi } from './swagger';

export const OPENAPI_FILE = 'openapi.json';

/** Claves de objetos en orden alfabético, en todos los niveles; los arreglos quedan igual. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => [key, sortKeys(inner)]),
  );
}

/**
 * Arma el documento sin base de datos: en modo `preview` Nest lee los módulos y los
 * controladores pero no crea los providers.
 */
export async function renderOpenApi(): Promise<string> {
  const env = loadEnv({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:1/openapi' });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    createAdapter(env),
    { preview: true, logger: false, abortOnError: false },
  );
  try {
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    const document = buildOpenApi(app);
    return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
  } finally {
    await app.close();
  }
}
