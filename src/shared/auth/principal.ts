import type { SessionUser } from '../contract';

/** Quién hace la petición: una sesión de la web o un token de la skill. */
export type Principal =
  | { kind: 'session'; user: SessionUser; sessionId: string }
  | { kind: 'token'; user: SessionUser; tokenId: string; projectId: string };

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
