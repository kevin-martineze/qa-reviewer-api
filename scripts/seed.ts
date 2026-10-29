// Carga la demo en la base de MONGO_URI (borra lo que haya).
// Uso: `pnpm seed` con `pnpm db` corriendo y el .env de desarrollo.
import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { loadEnv } from '../src/config/env';
import { seedDemo } from '../src/seed/demo-seed';

async function main(): Promise<void> {
  const env = { ...loadEnv(), JOBS_ENABLED: false };
  if (env.MONGO_URI === 'memory') {
    throw new Error('MONGO_URI=memory no persiste: usa `pnpm demo` o apunta a `pnpm db`.');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('La semilla borra la base: no corre con NODE_ENV=production.');
  }
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    logger: ['log', 'warn', 'error'],
  });
  try {
    await seedDemo(app);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
