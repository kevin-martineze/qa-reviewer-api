import type { Principal } from '../../shared/auth/principal';
import type { ApiToken, CreatedToken, SessionUser } from '../../shared/contract';
import type { ClientSession, Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { AccessService } from '../../shared/auth/access.service';
import { PAT_PREFIX } from '../../shared/auth/auth.guard';
import { AuditService } from '../../shared/events/activity.service';
import { notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toApiToken } from '../../shared/mappers';
import { ApiTokenDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { randomHex, sha256 } from '../../shared/util/ids';
import { TransactionService } from '../../shared/util/transaction.service';
import { ProjectsService } from '../projects/projects.service';

/** `qa_pat_` y los 4 primeros caracteres aleatorios: basta para reconocerlo en la lista. */
const PREFIX_LENGTH = PAT_PREFIX.length + 4;

/** Tokens personales de la skill. Cada persona ve y revoca solo los suyos. */
@Injectable()
export class TokensService {
  constructor(
    @InjectModel(ApiTokenDoc.name) private readonly tokens: Model<ApiTokenDoc>,
    private readonly projects: ProjectsService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  async list(principal: Principal): Promise<Envelope<ApiToken[]>> {
    const docs = await this.tokens
      .find({ userId: principal.user.id, revokedAt: null })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return envelope('tokens.list', docs.map(toApiToken));
  }

  /** El secreto se entrega una sola vez; se guarda su SHA-256. */
  async create(
    principal: Principal,
    projectId: string,
    label: string,
  ): Promise<Envelope<CreatedToken>> {
    const actor = principal.user;
    const project = await this.projects.findVisible(actor, projectId);
    this.access.assert(actor, 'tokens:own', project._id);
    const created = await this.tx.run((session) => this.issue(actor, project._id, label, session));
    return envelope('tokens.created', created);
  }

  /**
   * Crea el token y su entrada de auditoría dentro de la transacción del llamador. Los permisos
   * los revisa quien llama (POST /tokens o el login por navegador).
   */
  async issue(
    actor: SessionUser,
    projectId: string,
    label: string,
    session: ClientSession,
  ): Promise<CreatedToken> {
    const secret = `${PAT_PREFIX}${randomHex(16)}`;
    const prefix = secret.slice(0, PREFIX_LENGTH);
    const [created] = await this.tokens.create(
      [
        {
          hash: sha256(secret),
          prefix,
          label,
          userId: actor.id,
          projectId,
          createdAt: this.clock.now(),
        },
      ],
      { session },
    );
    if (!created) throw new Error('No se creó el token');
    await this.audit.log('token_created', actor.id, prefix, `creó el token «${label}»`, session);
    return { token: toApiToken(created.toObject()), secret };
  }

  async revoke(principal: Principal, id: string): Promise<void> {
    const actor = principal.user;
    await this.tx.run(async (session) => {
      const doc = await this.tokens
        .findOneAndUpdate(
          { _id: id, userId: actor.id, revokedAt: null },
          { revokedAt: this.clock.now() },
          { session },
        )
        .lean();
      if (!doc) throw notFound('tokens.not_found', 'Token no encontrado.');
      await this.audit.log(
        'token_revoked',
        actor.id,
        doc.prefix,
        `revocó el token «${doc.label}»`,
        session,
      );
    });
  }
}
