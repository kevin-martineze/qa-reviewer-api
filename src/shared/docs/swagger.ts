import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('QA Reviewer API')
    .setDescription(
      'Revisiones de UI entre desarrollo y diseño. Respuestas `{ messageKey, data }`; errores `{ statusCode, messageKey, message, details? }`.',
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'qa_sess_… (web) o qa_pat_… (skill)' })
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** UI en `/docs` y el contrato en `/docs-json` (de ahí el front genera sus tipos). */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApi(app), { jsonDocumentUrl: 'docs-json' });
}
