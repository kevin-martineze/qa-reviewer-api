import type { DemoData } from './demo-data';
import type { Review, Round, Screen } from '../shared/contract';
import type {
  ReviewDoc,
  StoredCapture,
  StoredReply,
  StoredRound,
  StoredScreen,
} from '../shared/schemas';
import type { StoragePort } from '../shared/storage/storage.port';
import type { INestApplicationContext } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';

import { hashPassword } from '../shared/auth/passwords';
import {
  ActivityDoc,
  ApiTokenDoc,
  AuditDoc,
  CommentDoc,
  CounterDoc,
  CredentialDoc,
  DEFAULT_LIMITS,
  InvitationDoc,
  MemberDoc,
  NotificationDoc,
  OrganizationDoc,
  ProjectDoc,
  RecoveryDoc,
  ReviewDoc as ReviewModel,
  UserDoc,
} from '../shared/schemas';
import { STORAGE } from '../shared/storage/storage.port';
import { sha256 } from '../shared/util/ids';

import { DEMO_DIR, loadDemoData } from './demo-data';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const HOUR = 60 * 60 * 1000;

/** Secreto de un token de la skill de la demo. Solo existe en la semilla. */
export function demoTokenSecret(prefix: string, id: string): string {
  return `${prefix}_demo_${id}`;
}

const date = (value: string): Date => new Date(value);
const dateOrNull = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

/** Sube cada imagen de `seed/demo/assets` a su clave del storage. */
class AssetUploader {
  private readonly files = new Map<string, Buffer>();

  constructor(
    private readonly storage: StoragePort,
    private readonly dir: string,
  ) {}

  async capture(ref: string | null, key: string): Promise<StoredCapture | null> {
    if (ref === null) return null;
    const file = ref.replace(/^asset:/, '');
    const ext = extname(file);
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new Error(`Imagen de la demo sin tipo conocido: ${file}`);

    let body = this.files.get(file);
    if (!body) {
      body = await readFile(join(this.dir, 'assets', file));
      this.files.set(file, body);
    }
    const objectKey = `${key}${ext}`;
    await this.storage.put(objectKey, body, contentType);
    return {
      key: objectKey,
      contentType,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }
}

function viewportOf(text: string): { width: number; height: number } {
  const match = /(\d+)\D+(\d+)/.exec(text);
  if (!match) throw new Error(`Viewport inválido en la demo: ${text}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function toScreen(
  review: Review,
  screen: Screen,
  assets: AssetUploader,
): Promise<StoredScreen> {
  const base = `projects/${review.project}/reviews/${review.id}`;
  const round = screen.changedIn;
  return {
    key: screen.key,
    title: screen.title,
    lead: screen.lead,
    route: screen.route,
    viewport: viewportOf(screen.viewport),
    after: await assets.capture(screen.img, `${base}/r${round}/${screen.key}/after`),
    before: await assets.capture(screen.before, `${base}/r${round}/${screen.key}/before`),
    previous: await assets.capture(
      screen.previous,
      `${base}/r${Math.max(round - 1, 1)}/${screen.key}/after`,
    ),
    changedIn: screen.changedIn,
    inherited: screen.inherited,
    roundNote: screen.roundNote,
    diff: screen.diff,
    elements: screen.elements,
    changes: screen.changes,
    questions: screen.questions,
    verdict: screen.verdict,
  };
}

function toRound(round: Round): StoredRound {
  return {
    n: round.n,
    by: round.by,
    createdAt: date(round.createdAt),
    note: round.note,
    changed: round.changed,
    verdicts: round.verdicts,
    submission: round.submission
      ? { ...round.submission, createdAt: date(round.submission.createdAt) }
      : null,
  };
}

async function toReview(review: Review, data: DemoData, assets: AssetUploader): Promise<ReviewDoc> {
  const author = data.users.find((u) => u.id === review.author);
  const screens: StoredScreen[] = [];
  for (const screen of review.screens) screens.push(await toScreen(review, screen, assets));
  const firstRound = review.rounds[0];

  return {
    _id: review.id,
    projectId: review.project,
    title: review.title,
    context: review.context,
    card: { key: review.card, title: review.title },
    pr: {
      ...review.pr,
      title: review.title,
      author: author?.email.split('@')[0] ?? review.author,
    },
    module: review.module,
    author: review.author,
    assignees: review.assignees,
    status: review.status,
    round: review.round,
    priority: review.priority,
    dueAt: dateOrNull(review.dueAt),
    summary: review.summary,
    notCaptured: review.notCaptured,
    screens,
    rounds: review.rounds.map(toRound),
    pending: null,
    privacy: { masked: true, dataset: 'demo' },
    generator: { name: 'qa-reviewer seed', version: '1' },
    createdAt: date(review.createdAt),
    updatedAt: date(review.updatedAt),
    publishedAt: review.status === 'draft' ? null : date(firstRound?.createdAt ?? review.createdAt),
    closedAt: review.status === 'closed' ? date(review.updatedAt) : null,
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    assetsPurgedAt: null,
  };
}

const serialOf = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * Borra la base y las capturas, y carga `seed/demo` con las fechas corridas a hoy.
 * Contraseña de todas las cuentas: la de `data.json`.
 */
export async function seedDemo(app: INestApplicationContext, dir = DEMO_DIR): Promise<void> {
  const logger = new Logger('Seed');
  const connection = app.get<Connection>(getConnectionToken());
  const storage = app.get<StoragePort>(STORAGE);
  const data = await loadDemoData(new Date(), dir);
  const model = (name: string) => connection.model(name);

  await connection.dropDatabase();
  await connection.syncIndexes();
  await storage.deletePrefix('projects/');

  const passwordHash = await hashPassword(data.password);
  const assets = new AssetUploader(storage, dir);

  await model(OrganizationDoc.name).create({ _id: data.org.id, name: data.org.name });

  await model(UserDoc.name).insertMany(
    data.users.map((u) => ({
      _id: u.id,
      name: u.name,
      email: u.email,
      orgRole: u.orgRole,
      status: u.status,
      avatar: u.avatar,
      lastSeenAt: dateOrNull(u.lastSeenAt),
      createdAt: date(u.createdAt),
      notificationPrefs: null,
    })),
  );
  await model(CredentialDoc.name).insertMany(data.users.map((u) => ({ _id: u.id, passwordHash })));

  await model(ProjectDoc.name).insertMany(
    data.projects.map(({ id, reviewsCount: _count, ...project }) => ({
      _id: id,
      ...project,
      limits: { ...DEFAULT_LIMITS },
      roundRobinLast: null,
    })),
  );
  await model(MemberDoc.name).insertMany(data.memberships);

  await model(InvitationDoc.name).insertMany(
    data.invites.map((i) => ({
      _id: i.id,
      tokenHash: sha256(i.token),
      email: i.email,
      role: i.role,
      projects: i.projects,
      invitedBy: i.inviter,
      createdAt: date(i.createdAt),
      expiresAt: date(i.expiresAt),
      usedAt: i.used ? date(i.createdAt) : null,
      revokedAt: i.revoked ? date(i.createdAt) : null,
    })),
  );
  await model(RecoveryDoc.name).insertMany(
    data.recoveries.map((r) => {
      const expiresAt = date(r.expiresAt);
      return {
        tokenHash: sha256(r.token),
        userId: r.userId,
        createdAt: new Date(expiresAt.getTime() - HOUR),
        expiresAt,
        usedAt: r.used ? new Date(expiresAt.getTime() - HOUR / 2) : null,
      };
    }),
  );
  await model(ApiTokenDoc.name).insertMany(
    data.tokens.map((t) => ({
      _id: t.id,
      hash: sha256(demoTokenSecret(t.prefix, t.id)),
      prefix: t.prefix,
      label: t.label,
      userId: t.owner,
      projectId: t.project,
      createdAt: date(t.createdAt),
      lastUsedAt: dateOrNull(t.lastUsedAt),
    })),
  );

  const reviews: ReviewDoc[] = [];
  for (const review of data.reviews) reviews.push(await toReview(review, data, assets));
  await model(ReviewModel.name).insertMany(reviews);
  await model(CounterDoc.name).create({
    _id: 'reviews',
    seq: Math.max(0, ...data.reviews.map((r) => serialOf(r.id))),
  });

  await model(CommentDoc.name).insertMany(
    data.comments.map((c) => ({
      _id: c.id,
      reviewId: c.review,
      screenKey: c.screen,
      round: c.round,
      author: c.author,
      body: c.body,
      anchor: c.anchor,
      el: c.el,
      resolved: c.resolved,
      followUp: c.followUp,
      replies: c.replies.map((r): StoredReply => ({
        id: r.id,
        author: r.author,
        body: r.body,
        createdAt: date(r.createdAt),
      })),
      createdAt: date(c.createdAt),
    })),
  );
  await model(NotificationDoc.name).insertMany(
    data.notifications.map(({ id, user, createdAt, readAt, ...n }) => ({
      _id: id,
      userId: user,
      ...n,
      createdAt: date(createdAt),
      readAt: dateOrNull(readAt),
    })),
  );
  await model(ActivityDoc.name).insertMany(
    data.activity.map(({ id, createdAt, ...a }) => ({ _id: id, ...a, createdAt: date(createdAt) })),
  );
  await model(AuditDoc.name).insertMany(
    data.audit.map(({ id, createdAt, ...a }) => ({ _id: id, ...a, createdAt: date(createdAt) })),
  );

  logger.log(
    `Demo cargada: ${data.users.length} personas, ${data.projects.length} proyectos, ` +
      `${reviews.length} revisiones, ${data.comments.length} comentarios.`,
  );
}
