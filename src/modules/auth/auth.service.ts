import type { Principal } from '../../shared/auth/principal';
import type {
  AcceptInviteInput,
  InviteInfo,
  LoginResult,
  ProfileInput,
  RecoveryInfo,
  SessionUser,
} from '../../shared/contract';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { dummyHash, hashPassword, verifyPassword } from '../../shared/auth/passwords';
import { SessionUserService } from '../../shared/auth/session-user.service';
import { badRequest, conflict, gone, notFound, unauthorized } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { inviteStatus } from '../../shared/mappers';
import { OutboxService } from '../../shared/outbox/outbox.service';
import {
  CredentialDoc,
  InvitationDoc,
  MemberDoc,
  OrganizationDoc,
  ProjectDoc,
  RecoveryDoc,
  UserDoc,
} from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { HOUR } from '../../shared/util/dates';
import { randomToken, sha256 } from '../../shared/util/ids';
import { TransactionService } from '../../shared/util/transaction.service';

import { SessionsService } from './sessions.service';

const INVALID_LOGIN = () => unauthorized('auth.invalid', 'Correo o contraseña incorrectos.');

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @InjectModel(CredentialDoc.name) private readonly credentials: Model<CredentialDoc>,
    @InjectModel(InvitationDoc.name) private readonly invitations: Model<InvitationDoc>,
    @InjectModel(RecoveryDoc.name) private readonly recoveries: Model<RecoveryDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @InjectModel(OrganizationDoc.name) private readonly orgs: Model<OrganizationDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly sessionUsers: SessionUserService,
    private readonly sessions: SessionsService,
    private readonly outbox: OutboxService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  async login(
    email: string,
    password: string,
    userAgent: string | null,
  ): Promise<Envelope<LoginResult>> {
    const user = await this.users.findOne({ email }).lean();
    const credential = user ? await this.credentials.findById(user._id).lean() : null;
    // Siempre se verifica un hash: el tiempo de respuesta no revela si el correo existe.
    const ok = await verifyPassword(credential?.passwordHash ?? (await dummyHash()), password);
    if (!user || !credential || !ok || user.status !== 'active') throw INVALID_LOGIN();

    const token = await this.sessions.open(user._id, userAgent);
    await this.users.updateOne({ _id: user._id }, { lastSeenAt: this.clock.now() });
    return envelope('auth.logged_in', { token, user: await this.sessionUsers.toSessionUser(user) });
  }

  async logout(principal: Principal): Promise<void> {
    if (principal.kind === 'session') await this.sessions.revoke(principal.sessionId);
  }

  async logoutEverywhere(principal: Principal): Promise<void> {
    await this.sessions.revokeAll(principal.user.id);
  }

  me(principal: Principal): Envelope<SessionUser> {
    return envelope('auth.me', principal.user);
  }

  async updateProfile(principal: Principal, input: ProfileInput): Promise<Envelope<SessionUser>> {
    const user = await this.users
      .findByIdAndUpdate(
        principal.user.id,
        { name: input.name, avatar: input.avatar },
        { new: true },
      )
      .lean();
    if (!user) throw notFound('users.not_found', 'Usuario no encontrado.');
    return envelope('auth.profile_updated', await this.sessionUsers.toSessionUser(user));
  }

  async changePassword(principal: Principal, current: string, next: string): Promise<void> {
    const credential = await this.credentials.findById(principal.user.id).lean();
    if (!credential || !(await verifyPassword(credential.passwordHash, current))) {
      throw badRequest('auth.wrong_password', 'La contraseña actual no coincide.');
    }
    if (current === next) {
      throw badRequest('auth.same_password', 'La nueva contraseña debe ser distinta de la actual.');
    }
    await this.setPassword(principal.user.id, next);
    await this.sessions.revokeAll(
      principal.user.id,
      principal.kind === 'session' ? principal.sessionId : undefined,
    );
  }

  /* ── Recuperación ───────────────────────────────────────────────── */

  async requestRecovery(email: string): Promise<void> {
    const user = await this.users.findOne({ email, status: 'active' }).lean();
    // Misma respuesta exista o no la cuenta: no se revela quién está registrado.
    if (!user) return;
    const token = randomToken(32);
    const now = this.clock.now();
    await this.tx.run(async (session) => {
      await this.recoveries.create(
        [
          {
            tokenHash: sha256(token),
            userId: user._id,
            createdAt: now,
            expiresAt: new Date(now.getTime() + HOUR),
          },
        ],
        { session },
      );
      await this.outbox.publish(
        'RecoveryRequested',
        { email: user.email, name: user.name, url: `${this.webUrl()}/recover/${token}` },
        session,
      );
    });
  }

  async recoveryInfo(token: string): Promise<Envelope<RecoveryInfo>> {
    const rec = await this.recoveries.findOne({ tokenHash: sha256(token) }).lean();
    if (!rec) throw notFound('recovery.not_found', 'Este enlace no es válido.');
    const status = rec.usedAt ? 'used' : rec.expiresAt < this.clock.now() ? 'expired' : 'valid';
    return envelope('recovery.info', { status });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const now = this.clock.now();
    // Se marca usado en la misma operación que se valida: dos clics no cambian dos veces.
    const rec = await this.recoveries.findOneAndUpdate(
      { tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: now } },
      { usedAt: now },
    );
    if (!rec) {
      const exists = await this.recoveries.exists({ tokenHash: sha256(token) });
      if (!exists) throw notFound('recovery.not_found', 'Este enlace no es válido.');
      throw gone('recovery.gone', 'Este enlace ya no está disponible.');
    }
    await this.setPassword(rec.userId, password);
    await this.sessions.revokeAll(rec.userId);
  }

  /* ── Invitaciones (lado del invitado) ───────────────────────────── */

  async inviteInfo(token: string): Promise<Envelope<InviteInfo>> {
    const invite = await this.invitations.findOne({ tokenHash: sha256(token) }).lean();
    if (!invite) throw notFound('invite.not_found', 'Esta invitación no existe.');
    const [org, inviter, projects] = await Promise.all([
      this.orgs.findOne().lean(),
      this.users.findById(invite.invitedBy).lean(),
      this.projects.find({ _id: { $in: invite.projects.map((p) => p.projectId) } }).lean(),
    ]);
    const names = new Map(projects.map((p) => [p._id, p.name]));
    return envelope('invite.info', {
      status: inviteStatus(invite, this.clock.now()),
      email: invite.email,
      org: org?.name ?? '',
      inviter: inviter?.name ?? '',
      role: invite.role,
      projects: invite.projects.map((p) => names.get(p.projectId) ?? p.projectId),
    });
  }

  async acceptInvite(
    token: string,
    input: AcceptInviteInput,
    userAgent: string | null,
  ): Promise<Envelope<LoginResult>> {
    const invite = await this.invitations.findOne({ tokenHash: sha256(token) }).lean();
    if (!invite) throw notFound('invite.not_found', 'Esta invitación no existe.');
    const status = inviteStatus(invite, this.clock.now());
    if (status !== 'valid')
      throw gone(`invite.${status}`, 'Esta invitación ya no está disponible.');
    if (await this.users.exists({ email: invite.email })) {
      throw conflict('users.exists', 'Ya hay una cuenta con este correo. Inicia sesión.');
    }

    const passwordHash = await hashPassword(input.password);
    const now = this.clock.now();
    const result = await this.tx.run(async (session) => {
      const used = await this.invitations.updateOne(
        { _id: invite._id, usedAt: null, revokedAt: null },
        { usedAt: now },
        { session },
      );
      if (used.modifiedCount !== 1)
        throw gone('invite.used', 'Esta invitación ya no está disponible.');
      const [user] = await this.users.create(
        [
          {
            name: input.name,
            email: invite.email,
            orgRole: invite.role,
            avatar: input.avatar,
            lastSeenAt: now,
            createdAt: now,
          },
        ],
        { session },
      );
      if (!user) throw new Error('No se creó el usuario');
      await this.credentials.create([{ _id: user._id, passwordHash, updatedAt: now }], { session });
      const existing = await this.projects
        .find({ _id: { $in: invite.projects.map((p) => p.projectId) } }, { _id: 1 }, { session })
        .lean();
      const valid = new Set(existing.map((p) => p._id));
      const memberships = invite.projects.filter((p) => valid.has(p.projectId));
      if (memberships.length) {
        await this.members.create(
          memberships.map((m) => ({
            projectId: m.projectId,
            userId: user._id,
            role: m.role,
            createdAt: now,
          })),
          { session },
        );
      }
      const sessionToken = await this.sessions.open(user._id, userAgent, session);
      return { userId: user._id, token: sessionToken };
    });

    const user = await this.sessionUsers.load(result.userId);
    if (!user) throw new Error('Usuario recién creado no encontrado');
    return envelope('invite.accepted', { token: result.token, user });
  }

  private async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.credentials.updateOne(
      { _id: userId },
      { passwordHash, updatedAt: this.clock.now() },
      { upsert: true },
    );
  }

  private webUrl(): string {
    return this.env.PUBLIC_WEB_URL.replace(/\/$/, '');
  }
}
