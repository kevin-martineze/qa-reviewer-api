import type { INestApplication } from '@nestjs/common';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { JOI_COMPONENTS } from './endpoint';

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('QA Reviewer API')
    .setDescription(
      'Revisiones de UI entre desarrollo y diseño. Respuestas `{ messageKey, data }`; errores `{ statusCode, messageKey, message, details? }`.',
    )
    .setVersion('1')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      description: 'qa_sess_… (web) o qa_pat_… (skill)',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const schemas = (document.components ??= {}).schemas ?? {};
  for (const [name, schema] of Object.entries(JOI_COMPONENTS)) {
    if (schemas[name]) throw new Error(`El esquema ${name} ya existe en el OpenAPI`);
    schemas[name] = schema;
  }
  document.components.schemas = schemas;
  return document;
}

/** UI en `/docs` y el contrato en `/docs-json` (de ahí el front genera sus tipos). */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApi(app), { jsonDocumentUrl: 'docs-json' });
}
