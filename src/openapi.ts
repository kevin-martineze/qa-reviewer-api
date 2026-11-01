// Escribe `openapi.json` con el contrato del API, claves ordenadas, sin levantar Mongo.
// Uso: `pnpm openapi` (compila con swc: Swagger y Mongoose necesitan la metadata de los
// decoradores, que tsx no emite). Una prueba falla si el archivo quedó desactualizado.
import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';

import { Logger } from '@nestjs/common';

import { OPENAPI_FILE, renderOpenApi } from './shared/docs/openapi-file';

async function main(): Promise<void> {
  await writeFile(OPENAPI_FILE, await renderOpenApi());
  new Logger('OpenAPI').log(`Contrato escrito en ${OPENAPI_FILE}`);
}

main().catch((error: unknown) => {
  new Logger('OpenAPI').error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
