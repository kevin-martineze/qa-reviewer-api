import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { Catch, HttpException, Logger } from '@nestjs/common';

import { ApiError, type ApiErrorBody } from './api-error';

const GENERIC: Record<number, { key: string; message: string }> = {
  400: { key: 'common.bad_request', message: 'La petición no es válida.' },
  401: { key: 'auth.required', message: 'Inicia sesión.' },
  403: { key: 'auth.forbidden', message: 'No tienes permiso para esta acción.' },
  404: { key: 'common.not_found', message: 'No encontramos este recurso.' },
  405: { key: 'common.method_not_allowed', message: 'Método no permitido.' },
  413: { key: 'common.payload_too_large', message: 'El contenido es demasiado grande.' },
  415: { key: 'common.unsupported_media', message: 'Tipo de contenido no soportado.' },
  429: { key: 'common.rate_limited', message: 'Demasiadas peticiones. Intenta más tarde.' },
};

/** Toda respuesta de error sale con la misma forma, sea del API, de Nest o inesperada. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = this.toBody(exception);
    void reply.status(body.statusCode).send(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ApiError) return exception.toBody();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const generic = GENERIC[status] ?? { key: 'common.error', message: exception.message };
      return { statusCode: status, messageKey: generic.key, message: generic.message };
    }
    const status = statusOf(exception);
    if (status && status < 500) {
      const generic = GENERIC[status] ?? { key: 'common.error', message: 'Error en la petición.' };
      return { statusCode: status, messageKey: generic.key, message: generic.message };
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    return { statusCode: 500, messageKey: 'common.internal', message: 'Algo salió mal.' };
  }
}

/** Errores de Fastify (JSON inválido, cuerpo muy grande) traen `statusCode`. */
function statusOf(exception: unknown): number | undefined {
  if (typeof exception === 'object' && exception !== null && 'statusCode' in exception) {
    const code = exception.statusCode;
    if (typeof code === 'number') return code;
  }
  return undefined;
}
