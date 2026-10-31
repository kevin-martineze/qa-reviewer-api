import type { Principal } from '../../shared/auth/principal';
import type {
  DeviceAuthorization,
  DeviceClient,
  DeviceGrant,
  DeviceRequest,
  SessionUser,
} from '../../shared/contract';
import type { Model } from 'mongoose';

import { randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../shared/auth/access.service';
import { can } from '../../shared/auth/permissions';
import { SessionUserService } from '../../shared/auth/session-user.service';
import {
  badRequest,
  conflict,
  forbidden,
  gone,
  notFound,
  tooMany,
} from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { DeviceDoc, ProjectDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { iso, MINUTE } from '../../shared/util/dates';
import { randomToken, sha256 } from '../../shared/util/ids';
import { isDuplicateKey } from '../../shared/util/mongo-errors';
import { RateLimitService } from '../../shared/util/rate-limit.service';
import { TransactionService } from '../../shared/util/transaction.service';
import { ProjectsService } from '../projects/projects.service';
import { TokensService } from '../tokens/tokens.service';

import {
  DEVICE_TTL_SECONDS,
  deviceStatus,
  formatUserCode,
  newUserCode,
  normalizeUserCode,
  POLL_INTERVAL_SECONDS,
  pollsTooSoon,
} from './domain/device-codes';

export interface DeviceStart {
  client: DeviceClient;
  repo: string | null;
}

/** Solicitudes nuevas por IP y por minuto. */
const STARTS_PER_MINUTE = 10;
/** Códigos inexistentes que una persona puede probar en 10 minutos. */
const MISSES_PER_WINDOW = 20;
const MISS_WINDOW_MS = 10 * MINUTE;

const NOT_FOUND = () =>
  notFound('device.not_found', 'El código no existe. Revisa que esté bien escrito.');
const EXPIRED = () =>
  gone('device.expired', 'El código venció. Vuelve a iniciar sesión desde la terminal.');
const USED = () => conflict('device.used', 'Este código ya se usó.');
const DENIED = () => forbidden('device.denied', 'Se rechazó el acceso desde el navegador.');

/**
 * Login de la skill por navegador (RFC 8628). La skill pide un código, la persona lo aprueba
 * con su sesión y la skill recoge el token al sondear. El token se crea en ese sondeo, así el
 * secreto nunca se guarda en claro.
 */
@Injectable()
export class DeviceService {
  constructor(
    @InjectModel(DeviceDoc.name) private readonly devices: Model<DeviceDoc>,
    @InjectModel(ProjectDoc.name) private readonly projectModel: Model<ProjectDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly projects: ProjectsService,
    private readonly tokens: TokensService,
    private readonly sessionUsers: SessionUserService,
    private readonly access: AccessService,
    private readonly rate: RateLimitService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  /* ── Skill ──────────────────────────────────────────────────────── */

  async start(input: DeviceStart, ip: string): Promise<Envelope<DeviceAuthorization>> {
    if (!(await this.rate.hit(`device-start:${sha256(ip)}`, STARTS_PER_MINUTE, MINUTE))) {
      throw tooMany('device.rate_limited', 'Demasiadas solicitudes de acceso. Espera un minuto.');
    }
    const now = this.clock.now();
    const deviceCode = `qa_dev_${randomToken(32)}`;
    const expiresAt = new Date(now.getTime() + DEVICE_TTL_SECONDS * 1000);

    // 32^8 códigos: un choque con uno vigente es muy raro, pero se reintenta.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const userCode = newUserCode(randomInt);
      try {
        await this.devices.create({
          deviceCodeHash: sha256(deviceCode),
          userCodeHash: sha256(userCode),
          client: input.client,
          repo: input.repo,
          status: 'pending',
          createdAt: now,
          expiresAt,
        });
      } catch (error) {
        if (isDuplicateKey(error)) continue;
        throw error;
      }
      const code = formatUserCode(userCode);
      const web = this.env.PUBLIC_WEB_URL.replace(/\/$/, '');
      return envelope('device.started', {
        deviceCode,
        userCode: code,
        verificationUri: `${web}/device`,
        verificationUriComplete: `${web}/device?code=${code}`,
        expiresIn: DEVICE_TTL_SECONDS,
        interval: POLL_INTERVAL_SECONDS,
      });
    }
    throw new Error('No se pudo generar un código de dispositivo único');
  }

  async poll(deviceCode: string): Promise<Envelope<DeviceGrant>> {
    const now = this.clock.now();
    const doc = await this.devices.findOne({ deviceCodeHash: sha256(deviceCode) }).lean();
    if (!doc) throw NOT_FOUND();
    if (doc.status === 'used') throw USED();
    if (doc.expiresAt.getTime() <= now.getTime()) throw EXPIRED();

    const tooSoon = pollsTooSoon(doc.lastPolledAt, now);
    await this.devices.updateOne({ _id: doc._id }, { lastPolledAt: now });
    if (tooSoon) {
      throw tooMany('device.slow_down', 'Sondeas demasiado seguido: espera 5 segundos más.');
    }
    if (doc.status === 'pending') {
      throw badRequest('device.pending', 'Esperando la aprobación en el navegador.');
    }
    if (doc.status === 'denied') throw DENIED();

    return envelope('device.granted', await this.grant(doc._id));
  }

  /** Aprobado → usado y el token creado, en una sola transacción. */
  private grant(deviceId: string): Promise<DeviceGrant> {
    return this.tx.run(async (session) => {
      const claimed = await this.devices
        .findOneAndUpdate(
          { _id: deviceId, status: 'approved' },
          { status: 'used' },
          { new: true, session },
        )
        .lean();
      if (!claimed?.userId || !claimed.projectId || !claimed.label) throw USED();

      // Quien aprobó pudo perder el acceso entre aprobar y el sondeo.
      const user = await this.sessionUsers.load(claimed.userId);
      if (!user || !can(user, 'tokens:own', claimed.projectId)) throw DENIED();
      const project = await this.projectModel.findById(claimed.projectId, null, { session }).lean();
      if (!project) throw DENIED();

      const created = await this.tokens.issue(user, project._id, claimed.label, session);
      return {
        ...created,
        project: { id: project._id, name: project.name },
        user: { id: user.id, name: user.name, email: user.email },
      };
    });
  }

  /* ── Web ────────────────────────────────────────────────────────── */

  async get(principal: Principal, userCode: string): Promise<Envelope<DeviceRequest>> {
    const { doc, code } = await this.find(principal.user, userCode);
    return envelope('device.request', await this.toRequest(principal.user, doc, code));
  }

  async approve(
    principal: Principal,
    userCode: string,
    projectId: string,
    label: string | undefined,
  ): Promise<Envelope<DeviceRequest>> {
    const user = principal.user;
    const { doc, code } = await this.find(user, userCode);
    this.assertOpen(doc);
    const project = await this.projects.findVisible(user, projectId);
    this.access.assert(user, 'tokens:own', project._id);

    const updated = await this.devices
      .findOneAndUpdate(
        { _id: doc._id, status: 'pending', expiresAt: { $gt: this.clock.now() } },
        {
          status: 'approved',
          userId: user.id,
          projectId: project._id,
          label: label ?? `Claude Code · ${doc.client.hostname}`,
        },
        { new: true },
      )
      .lean();
    if (!updated) throw USED();
    return envelope('device.approved', await this.toRequest(user, updated, code));
  }

  async deny(principal: Principal, userCode: string): Promise<void> {
    const user = principal.user;
    const { doc } = await this.find(user, userCode);
    this.assertOpen(doc);
    const res = await this.devices.updateOne(
      { _id: doc._id, status: 'pending', expiresAt: { $gt: this.clock.now() } },
      { status: 'denied', userId: user.id },
    );
    if (res.modifiedCount !== 1) throw USED();
  }

  /* ── Apoyo ──────────────────────────────────────────────────────── */

  /** Busca por código; cada código inexistente cuenta para el límite de la persona. */
  private async find(user: SessionUser, raw: string): Promise<{ doc: DeviceDoc; code: string }> {
    const key = `device-miss:${user.id}`;
    if (await this.rate.reached(key, MISSES_PER_WINDOW, MISS_WINDOW_MS)) {
      throw tooMany('device.rate_limited', 'Probaste demasiados códigos. Espera unos minutos.');
    }
    const code = normalizeUserCode(raw);
    const doc = code ? await this.devices.findOne({ userCodeHash: sha256(code) }).lean() : null;
    if (!code || !doc) {
      await this.rate.hit(key, MISSES_PER_WINDOW, MISS_WINDOW_MS);
      throw NOT_FOUND();
    }
    return { doc, code };
  }

  /** Aprobar o rechazar solo mientras está pendiente y vigente. */
  private assertOpen(doc: DeviceDoc): void {
    if (doc.status !== 'pending') throw USED();
    if (doc.expiresAt.getTime() <= this.clock.now().getTime()) throw EXPIRED();
  }

  private async toRequest(user: SessionUser, doc: DeviceDoc, code: string): Promise<DeviceRequest> {
    return {
      userCode: formatUserCode(code),
      status: deviceStatus(doc.status, doc.expiresAt, this.clock.now()),
      expiresAt: iso(doc.expiresAt),
      client: { ...doc.client },
      repo: doc.repo,
      suggestedProjectId: await this.suggest(user, doc.repo),
    };
  }

  /** El primer proyecto con ese repo (sin distinguir mayúsculas) donde la persona tiene `tokens:own`. */
  private async suggest(user: SessionUser, repo: string | null): Promise<string | null> {
    if (!repo) return null;
    const candidates = await this.projectModel
      .find({ repo }, { _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .sort({ _id: 1 })
      .lean();
    return candidates.find((p) => can(user, 'tokens:own', p._id))?._id ?? null;
  }
}
