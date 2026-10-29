import type { UserChange } from './domain/user-change';
import type { Principal } from '../../shared/auth/principal';
import type {
  AuditEvent,
  AuditType,
  Invitation,
  Membership,
  Organization,
  OrgRole,
  PaginatedResponse,
  User,
} from '../../shared/contract';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../shared/auth/access.service';
import { AuditService } from '../../shared/events/activity.service';
import { badRequest, conflict, forbidden, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toAuditEvent, toInvitation, toOrganization, toUser } from '../../shared/mappers';
import { OutboxService } from '../../shared/outbox/outbox.service';
import {
  ApiTokenDoc,
  AuditDoc,
  InvitationDoc,
  OrganizationDoc,
  ProjectDoc,
  SessionDoc,
  UserDoc,
} from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { DAY } from '../../shared/util/dates';
import { randomToken, sha256 } from '../../shared/util/ids';
import { TransactionService } from '../../shared/util/transaction.service';

import { denialOf, permissionFor } from './domain/user-change';

export const INVITE_TTL_DAYS = 7;

export interface NewInvitation {
  email: string;
  role: OrgRole;
  projects: Membership[];
}

export interface AuditQuery {
  type?: AuditType;
  actor?: string;
  page: number;
  limit: number;
}

const USER_NOT_FOUND = () => notFound('users.not_found', 'Usuario no encontrado.');

/** Organización, personas, invitaciones y registro de auditoría. */
@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(OrganizationDoc.name) private readonly orgs: Model<OrganizationDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @InjectModel(InvitationDoc.name) private readonly invitations: Model<InvitationDoc>,
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @InjectModel(SessionDoc.name) private readonly sessions: Model<SessionDoc>,
    @InjectModel(ApiTokenDoc.name) private readonly tokens: Model<ApiTokenDoc>,
    @InjectModel(AuditDoc.name) private readonly auditLog: Model<AuditDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  async organization(): Promise<Envelope<Organization>> {
    const org = await this.orgs.findOne().lean();
    if (!org) throw notFound('organization.not_found', 'La organización no está configurada.');
    return envelope('organization.get', toOrganization(org));
  }

  /** El shell la pide en cada página: una sola consulta, sin preferencias ni credenciales. */
  async listUsers(): Promise<Envelope<User[]>> {
    const users = await this.users
      .find({}, { notificationPrefs: 0 })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    return envelope('users.list', users.map(toUser));
  }

  async updateUser(
    principal: Principal,
    userId: string,
    change: UserChange,
  ): Promise<Envelope<User>> {
    const actor = principal.user;
    this.access.assert(actor, permissionFor(change), null);

    const target = await this.users.findById(userId).lean();
    if (!target) throw USER_NOT_FOUND();
    const denial = denialOf(actor, { id: target._id, orgRole: target.orgRole }, change);
    if (denial?.status === 403) {
      throw forbidden(denial.key, denial.message, { permission: denial.permission });
    }
    if (denial) throw conflict(denial.key, denial.message);

    const unchanged =
      'status' in change ? target.status === change.status : target.orgRole === change.orgRole;
    if (unchanged) return envelope('users.updated', toUser(target));

    const now = this.clock.now();
    const updated = await this.tx.run(async (session) => {
      // Guarda: si el rol o el estado cambiaron desde la lectura, no se pisa.
      const doc = await this.users
        .findOneAndUpdate(
          { _id: target._id, orgRole: target.orgRole, status: target.status },
          { $set: change },
          { new: true, session, projection: { notificationPrefs: 0 } },
        )
        .lean();
      if (!doc) {
        throw conflict(
          'users.changed',
          'La cuenta cambió mientras la editabas. Recarga la página.',
        );
      }
      if ('status' in change && change.status === 'inactive') {
        // Sin acceso: se cierran sus sesiones y se revocan sus tokens de la skill.
        await this.sessions.updateMany(
          { userId: doc._id, revokedAt: null },
          { revokedAt: now },
          { session },
        );
        await this.tokens.updateMany(
          { userId: doc._id, revokedAt: null },
          { revokedAt: now },
          { session },
        );
      }
      const [type, text] =
        'status' in change
          ? change.status === 'inactive'
            ? (['user_deactivated', `desactivó a ${doc.name}`] as const)
            : (['user_reactivated', `reactivó a ${doc.name}`] as const)
          : (['role_changed', `cambió el rol de ${doc.name} a ${change.orgRole}`] as const);
      await this.audit.log(type, actor.id, doc._id, text, session);
      return doc;
    });
    return envelope('users.updated', toUser(updated));
  }

  /* ── Invitaciones (lado de quien invita) ────────────────────────── */

  async listInvitations(principal: Principal): Promise<Envelope<Invitation[]>> {
    this.access.assert(principal.user, 'users:invite', null);
    const now = this.clock.now();
    const docs = await this.invitations.find().sort({ createdAt: -1, _id: -1 }).lean();
    return envelope(
      'invitations.list',
      docs.map((d) => toInvitation(d, now)),
    );
  }

  async invite(principal: Principal, input: NewInvitation): Promise<Envelope<Invitation>> {
    const actor = principal.user;
    this.access.assert(actor, 'users:invite', null);
    if (input.role === 'owner') this.access.assert(actor, 'org:manage', null);

    const now = this.clock.now();
    if (await this.users.exists({ email: input.email })) {
      throw conflict('users.exists', 'Ya hay un usuario con ese correo.');
    }
    const pending = await this.invitations.exists({
      email: input.email,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (pending) throw conflict('invite.pending', 'Ya hay una invitación vigente para ese correo.');

    const projectIds = input.projects.map((p) => p.projectId);
    const found = await this.projects.countDocuments({ _id: { $in: projectIds } });
    if (found !== projectIds.length) {
      throw badRequest('invite.invalid_projects', 'Alguno de los proyectos elegidos no existe.');
    }

    const token = randomToken(32);
    const org = await this.orgs.findOne().lean();
    const doc = await this.tx.run(async (session) => {
      const [created] = await this.invitations.create(
        [
          {
            tokenHash: sha256(token),
            email: input.email,
            role: input.role,
            projects: input.projects,
            invitedBy: actor.id,
            createdAt: now,
            expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY),
          },
        ],
        { session },
      );
      if (!created) throw new Error('No se creó la invitación');
      await this.outbox.publish(
        'InvitationCreated',
        {
          email: input.email,
          inviter: actor.name,
          org: org?.name ?? '',
          url: `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/invite/${token}`,
          expiresAt: created.expiresAt.toISOString(),
        },
        session,
      );
      await this.audit.log(
        'user_invited',
        actor.id,
        input.email,
        `invitó a ${input.email}`,
        session,
      );
      return created.toObject();
    });
    return envelope('invitations.created', toInvitation(doc, now));
  }

  async revokeInvitation(principal: Principal, invitationId: string): Promise<void> {
    this.access.assert(principal.user, 'users:invite', null);
    const invite = await this.invitations.findById(invitationId).lean();
    if (!invite) throw notFound('invite.not_found', 'Invitación no encontrada.');
    // Revocar una invitación ya usada o revocada no cambia nada: la respuesta es la misma.
    await this.invitations.updateOne(
      { _id: invite._id, usedAt: null, revokedAt: null },
      { revokedAt: this.clock.now() },
    );
  }

  /* ── Auditoría ──────────────────────────────────────────────────── */

  async listAudit(
    principal: Principal,
    query: AuditQuery,
  ): Promise<Envelope<PaginatedResponse<AuditEvent>>> {
    this.access.assert(principal.user, 'users:invite', null);
    const filter: { type?: AuditType; actor?: string } = {};
    if (query.type) filter.type = query.type;
    if (query.actor) filter.actor = query.actor;
    const [total, docs] = await Promise.all([
      this.auditLog.countDocuments(filter),
      this.auditLog
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
    ]);
    return envelope('audit.list', {
      items: docs.map(toAuditEvent),
      pagination: { page: query.page, limit: query.limit, total },
    });
  }
}
