// Errores del API: `{ statusCode, messageKey, message, details? }`. El front muestra `message`
// tal cual (toasts y formularios), así que va en español y pensado para la persona.
import { HttpException } from '@nestjs/common';

export interface ApiErrorBody {
  statusCode: number;
  messageKey: string;
  message: string;
  details?: unknown;
}

export class ApiError extends HttpException {
  constructor(
    readonly statusCode: number,
    readonly messageKey: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ statusCode, messageKey, message, details } satisfies ApiErrorBody, statusCode);
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = {
      statusCode: this.statusCode,
      messageKey: this.messageKey,
      message: this.message,
    };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

export const badRequest = (key: string, message: string, details?: unknown) =>
  new ApiError(400, key, message, details);
export const unauthorized = (key = 'auth.required', message = 'Inicia sesión.') =>
  new ApiError(401, key, message);
export const forbidden = (key: string, message: string, details?: unknown) =>
  new ApiError(403, key, message, details);
export const notFound = (key: string, message: string) => new ApiError(404, key, message);
export const conflict = (key: string, message: string, details?: unknown) =>
  new ApiError(409, key, message, details);
export const gone = (key: string, message: string) => new ApiError(410, key, message);
export const unprocessable = (key: string, message: string, details?: unknown) =>
  new ApiError(422, key, message, details);
export const tooMany = (key: string, message: string) => new ApiError(429, key, message);
