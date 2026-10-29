import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type * as Joi from 'joi';

import { badRequest } from './api-error';

/** Valida y normaliza body/query/params con su esquema Joi. Los campos de más se descartan. */
export class JoiPipe<T = unknown> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: Joi.Schema<T>) {}

  transform(value: unknown, _meta: ArgumentMetadata): T {
    const { value: out, error } = this.schema.validate(value ?? {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const fields: Record<string, string> = {};
      for (const d of error.details) {
        const key = d.path.join('.') || 'body';
        fields[key] ??= d.message;
      }
      throw badRequest('common.validation', 'Revisa los datos enviados.', { fields });
    }
    return out;
  }
}
