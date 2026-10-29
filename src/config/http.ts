import type { Env } from './env';

import { FastifyAdapter } from '@nestjs/platform-fastify';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Fastify del API: JSON hasta 2 MB y, para el storage local, imágenes como binario. */
export function createAdapter(env: Pick<Env, 'NODE_ENV'>): FastifyAdapter {
  const adapter = new FastifyAdapter({
    logger: env.NODE_ENV === 'production' ? { level: 'info' } : false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });
  adapter
    .getInstance()
    .addContentTypeParser(
      /^image\//,
      { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
      (_req, body, done) => done(null, body),
    );
  return adapter;
}
