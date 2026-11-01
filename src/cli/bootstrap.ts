// CLI del primer arranque. Compilado a dist/, corre dentro de la imagen de producción:
//   docker compose -f docker-compose.prod.yml exec api node dist/cli/bootstrap \
//     --org "Mi organización" --owner tu@correo.com --name "Tu nombre" [--id mi-organizacion]
// En desarrollo: `pnpm bootstrap -- --org … --owner … --name …` contra MONGO_URI.
import 'reflect-metadata';
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { BootstrapRefused, bootstrapOrganization } from '../bootstrap/bootstrap';
import { BOOTSTRAP_LINK_HOURS, parseBootstrapInput } from '../bootstrap/domain';
import { loadEnv } from '../config/env';

const out = (line: string) => process.stdout.write(`${line}\n`);
const err = (line: string) => process.stderr.write(`${line}\n`);

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      org: { type: 'string' },
      id: { type: 'string' },
      owner: { type: 'string' },
      name: { type: 'string' },
    },
  });
  const input = parseBootstrapInput(values);
  if (input.errors) {
    err(
      'Uso: bootstrap --org "Mi organización" --owner tu@correo.com --name "Tu nombre" [--id slug]',
    );
    for (const e of input.errors) err(`  · ${e}`);
    return 2;
  }

  const env = { ...loadEnv(), JOBS_ENABLED: false };
  if (env.MONGO_URI === 'memory') {
    err('MONGO_URI=memory no persiste: apunta a una base real.');
    return 2;
  }
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    logger: ['warn', 'error'],
  });
  try {
    const result = await bootstrapOrganization(app, input.value);
    out(`Organización «${input.value.org}» (${result.orgId}) creada.`);
    out(`Owner: ${input.value.name} <${result.email}>.`);
    out('');
    out(`Define la contraseña en este enlace (un solo uso, ${BOOTSTRAP_LINK_HOURS} h):`);
    out(result.url);
    return 0;
  } catch (error) {
    if (error instanceof BootstrapRefused) {
      err(error.message);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    err(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  },
);
