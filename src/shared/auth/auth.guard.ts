import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { unauthorized } from '../http/api-error';
import { ApiTokenDoc, SessionDoc, UserDoc } from '../schemas';
import { ClockService } from '../util/clock.service';
import { DAY, MINUTE } from '../util/dates';
import { sha256 } from '../util/ids';

import { API_TOKEN_KEY, bearerOf, PUBLIC_KEY } from './decorators';
import { SessionUserService } from './session-user.service';

export const SESSION_PREFIX = 'qa_sess_';
export const PAT_PREFIX = 'qa_pat_';

/**
 * Autentica cada petición con `Authorization: Bearer`. Las sesiones de la web sirven en todo
 * el API; los tokens de la skill solo donde el handler lo permite (`@AllowApiToken`).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionUsers: SessionUserService,
    private readonly clock: ClockService,
    @Inject(ENV) private readonly env: Env,
    @InjectModel(SessionDoc.name) private readonly sessions: Model<SessionDoc>,
    @InjectModel(ApiTokenDoc.name) private readonly tokens: Model<ApiTokenDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = bearerOf(request);
    if (!token) throw unauthorized();

    if (token.startsWith(PAT_PREFIX)) {
      if (!this.reflector.getAllAndOverride<boolean>(API_TOKEN_KEY, targets)) {
        throw unauthorized('auth.token_not_allowed', 'Este endpoint requiere una sesión.');
      }
      return this.byApiToken(request, token);
    }
    return this.bySession(request, token);
  }

  private async bySession(request: FastifyRequest, token: string): Promise<boolean> {
    const now = this.clock.now();
    const session = await this.sessions
      .findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: now } })
      .lean();
    if (!session)
      throw unauthorized('auth.session_expired', 'Tu sesión venció. Inicia sesión otra vez.');
    const user = await this.sessionUsers.load(session.userId);
    if (!user)
      throw unauthorized('auth.session_expired', 'Tu sesión venció. Inicia sesión otra vez.');

    // Vencimiento deslizante, sin escribir en cada request.
    if (now.getTime() - session.lastUsedAt.getTime() > MINUTE) {
      const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_DAYS * DAY);
      await this.sessions.updateOne({ _id: session._id }, { lastUsedAt: now, expiresAt });
      await this.users.updateOne({ _id: user.id }, { lastSeenAt: now });
    }
    request.principal = { kind: 'session', user, sessionId: session._id };
    return true;
  }

  private async byApiToken(request: FastifyRequest, token: string): Promise<boolean> {
    const record = await this.tokens.findOne({ hash: sha256(token), revokedAt: null }).lean();
    if (!record) throw unauthorized('auth.invalid_token', 'El token no es válido o fue revocado.');
    const user = await this.sessionUsers.load(record.userId);
    if (!user) throw unauthorized('auth.invalid_token', 'El token no es válido o fue revocado.');

    const now = this.clock.now();
    if (!record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > MINUTE) {
      await this.tokens.updateOne({ _id: record._id }, { lastUsedAt: now });
    }
    request.principal = { kind: 'token', user, tokenId: record._id, projectId: record.projectId };
    return true;
  }
}
