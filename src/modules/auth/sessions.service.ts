import type { ClientSession, Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { SESSION_PREFIX } from '../../shared/auth/auth.guard';
import { SessionDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { DAY } from '../../shared/util/dates';
import { randomToken, sha256 } from '../../shared/util/ids';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(SessionDoc.name) private readonly sessions: Model<SessionDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly clock: ClockService,
  ) {}

  /** Abre una sesión y devuelve el token. Solo se guarda su hash (ADR 0009). */
  async open(userId: string, userAgent: string | null, session?: ClientSession): Promise<string> {
    const token = `${SESSION_PREFIX}${randomToken(32)}`;
    const now = this.clock.now();
    await this.sessions.create(
      [
        {
          tokenHash: sha256(token),
          userId,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + this.env.SESSION_TTL_DAYS * DAY),
          userAgent: userAgent?.slice(0, 200) ?? null,
        },
      ],
      { session },
    );
    return token;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessions.updateOne(
      { _id: sessionId, revokedAt: null },
      { revokedAt: this.clock.now() },
    );
  }

  /** Revoca todas las sesiones del usuario, salvo `except` (la actual, al cambiar la contraseña). */
  async revokeAll(userId: string, except?: string): Promise<void> {
    const filter: Record<string, unknown> = { userId, revokedAt: null };
    if (except) filter._id = { $ne: except };
    await this.sessions.updateMany(filter, { revokedAt: this.clock.now() });
  }
}
