import type { Principal } from './principal';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { createParamDecorator, SetMetadata } from '@nestjs/common';

import { unauthorized } from '../http/api-error';

export const PUBLIC_KEY = 'qa:public';
export const API_TOKEN_KEY = 'qa:api-token';

/** Sin autenticación (login, invitaciones, recuperación, webhook, salud). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Acepta también el token personal de la skill (`qa_pat_…`), no solo la sesión. */
export const AllowApiToken = () => SetMetadata(API_TOKEN_KEY, true);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = ctx.switchToHttp().getRequest<FastifyRequest>().principal;
  if (!principal) throw unauthorized();
  return principal;
});

export function bearerOf(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
  return value.trim();
}

export type { Principal };
