import type { Type } from '@nestjs/common';
import type {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type * as Joi from 'joi';

import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import joiToSwagger from 'joi-to-swagger';

type Shape = Type<unknown> | [Type<unknown>] | SchemaObject;

export interface EndpointSpec {
  summary: string;
  description?: string;
  /** Mismo esquema Joi que valida el body: lo documentado es lo que se valida. */
  body?: Joi.Schema;
  query?: Joi.ObjectSchema;
  /** Forma de `data` en la respuesta; sin `ok`, el endpoint responde 204. */
  ok?: Shape;
  status?: number;
  messageKey?: string;
  /** Claves de error por status, además de las comunes (401 y, con body, 400). */
  errors?: Record<number, string[]>;
  public?: boolean;
}

function schemaOf(shape: Shape): {
  schema: SchemaObject | ReferenceObject;
  models: Type<unknown>[];
} {
  if (Array.isArray(shape)) {
    const [model] = shape;
    return { schema: { type: 'array', items: { $ref: getSchemaPath(model) } }, models: [model] };
  }
  if (typeof shape === 'function')
    return { schema: { $ref: getSchemaPath(shape) }, models: [shape] };
  return { schema: shape, models: [] };
}

const errorSchema = (status: number, keys: string[]): SchemaObject => ({
  type: 'object',
  properties: {
    statusCode: { type: 'integer', example: status },
    messageKey: { type: 'string', enum: keys, example: keys[0] },
    message: { type: 'string' },
    details: { type: 'object' },
  },
  required: ['statusCode', 'messageKey', 'message'],
});

/** Toda la documentación de un handler en un solo decorador. */
export function Endpoint(spec: EndpointSpec) {
  const decorators = [ApiOperation({ summary: spec.summary, description: spec.description })];
  if (!spec.public) decorators.push(ApiBearerAuth());
  if (spec.body) {
    decorators.push(ApiBody({ schema: joiToSwagger(spec.body).swagger as SchemaObject }));
  }
  if (spec.query) {
    const swagger = joiToSwagger(spec.query).swagger as SchemaObject;
    const required = new Set(swagger.required ?? []);
    for (const [name, schema] of Object.entries(swagger.properties ?? {})) {
      decorators.push(
        ApiQuery({ name, required: required.has(name), schema: schema as SchemaObject }),
      );
    }
  }
  if (spec.ok) {
    const { schema, models } = schemaOf(spec.ok);
    decorators.push(
      ApiExtraModels(...models),
      ApiResponse({
        status: spec.status ?? 200,
        description: 'OK',
        schema: {
          type: 'object',
          properties: {
            messageKey: { type: 'string', example: spec.messageKey ?? 'ok' },
            data: schema,
          },
          required: ['messageKey', 'data'],
        },
      }),
    );
  } else {
    decorators.push(ApiNoContentResponse({ description: 'Sin cuerpo' }));
  }
  const errors: Record<number, string[]> = { ...(spec.errors ?? {}) };
  if (!spec.public) errors[401] = ['auth.required', 'auth.session_expired', ...(errors[401] ?? [])];
  if (spec.body || spec.query) errors[400] = ['common.validation', ...(errors[400] ?? [])];
  for (const [status, keys] of Object.entries(errors)) {
    decorators.push(
      ApiResponse({
        status: Number(status),
        description: keys.join(' · '),
        schema: errorSchema(Number(status), keys),
      }),
    );
  }
  return applyDecorators(...decorators);
}
