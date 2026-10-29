import type { Manifest } from './domain/manifest';
import type { CaptureKeyOf, RoundDiff } from './domain/round-diff';
import type { Principal } from '../../shared/auth/principal';
import type { Comment, Review, SessionUser } from '../../shared/contract';
import type { PendingRound, PendingUpload, StoredReviewStatus } from '../../shared/schemas';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../shared/auth/access.service';
import { can } from '../../shared/auth/permissions';
import { ActivityService } from '../../shared/events/activity.service';
import { NotifyService } from '../../shared/events/notify.service';
import { ApiError, conflict, notFound, unprocessable } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toComment } from '../../shared/mappers';
import { OutboxService } from '../../shared/outbox/outbox.service';
import {
  CommentDoc,
  DEFAULT_LIMITS,
  MemberDoc,
  ProjectDoc,
  ReviewDoc,
  UserDoc,
} from '../../shared/schemas';
import { STORAGE, type StoragePort } from '../../shared/storage/storage.port';
import { ClockService } from '../../shared/util/clock.service';
import { isDuplicateKey } from '../../shared/util/mongo-errors';
import { SerialService } from '../../shared/util/serial.service';
import { TransactionService } from '../../shared/util/transaction.service';

import { REVIEWER_ROLES } from './domain/assignees';
import { assign } from './domain/assignment';
import { dueFrom } from './domain/due';
import { feedbackText, lastSubmittedRound } from './domain/feedback-text';
import { manifestProblem, moduleOf, notCapturedText } from './domain/manifest';
import { ACTIVE_STATUSES, nextStatus } from './domain/review-state';
import { diffRound } from './domain/round-diff';
import { IdempotencyService } from './idempotency.service';
import { ReviewMapper } from './reviews.mapper';
import { REVIEW_NOT_FOUND, STALE_STATUS } from './reviews.service';

export interface Upload {
  screenKey: string;
  kind: 'after' | 'before';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/** Respuesta de la skill al crear, subir una ronda o publicar. */
export interface ReviewDraft {
  id: string;
  round: number;
  status: StoredReviewStatus;
  uploads: Upload[];
  changed: string[];
  url: string;
}

export interface FeedbackStatus {
  review: Review;
  comments: Comment[];
  text: string;
}

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp' };

/** Endpoints de la skill `/design-review`: manifiesto, rondas, publicación y feedback. */
@Injectable()
export class SkillService {
  constructor(
    @InjectModel(ReviewDoc.name) private readonly reviews: Model<ReviewDoc>,
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @InjectModel(CommentDoc.name) private readonly comments: Model<CommentDoc>,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(ENV) private readonly env: Env,
    private readonly mapper: ReviewMapper,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly outbox: OutboxService,
    private readonly serial: SerialService,
    private readonly idempotency: IdempotencyService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  /* ── Crear (ronda 1) ────────────────────────────────────────────── */

  create(
    principal: Principal,
    key: string | undefined,
    manifest: Manifest,
  ): Promise<Envelope<ReviewDraft>> {
    return this.idempotency.run(principal.user.id, key, 'POST /reviews', manifest, () =>
      this.createDraft(principal, manifest),
    );
  }

  private async createDraft(principal: Principal, m: Manifest): Promise<Envelope<ReviewDraft>> {
    const actor = principal.user;
    const project = await this.projectFor(actor, m.project);
    this.access.assert(actor, 'reviews:create', project._id);
    this.check(m, principal, project, null);

    const existing = await this.reviews
      .findOne({
        projectId: project._id,
        'pr.number': m.pr.number,
        status: { $in: ACTIVE_STATUSES },
      })
      .lean();
    if (existing?.status === 'draft' && existing.author === actor.id) {
      return this.replaceDraft(existing, m, actor);
    }
    if (existing) throw this.exists(m.pr.number, existing._id);

    const now = this.clock.now();
    try {
      const { id, pending } = await this.tx.run(async (session) => {
        const id = await this.serial.next('reviews', 'QR', session);
        const pending = this.pendingRound(
          1,
          actor.id,
          now,
          m,
          diffRound([], m.screens, 1, this.keyOf(project._id, id, 1)),
        );
        await this.reviews.create(
          [
            {
              _id: id,
              projectId: project._id,
              ...this.snapshot(m),
              author: actor.id,
              assignees: [],
              status: 'draft',
              round: 0,
              priority: 'medium',
              dueAt: null,
              screens: [],
              rounds: [],
              pending,
              privacy: m.privacy,
              generator: m.generator,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        return { id, pending };
      });
      return envelope('reviews.draft_created', await this.draft(id, 1, 'draft', pending));
    } catch (error) {
      // Otro intento creó la revisión del mismo PR entre la lectura y la escritura.
      if (isDuplicateKey(error)) throw this.exists(m.pr.number, null);
      throw error;
    }
  }

  /** La skill volvió a correr antes de publicar la ronda 1: el borrador se reemplaza. */
  private async replaceDraft(
    existing: ReviewDoc,
    m: Manifest,
    actor: SessionUser,
  ): Promise<Envelope<ReviewDraft>> {
    const now = this.clock.now();
    const diff = diffRound([], m.screens, 1, this.keyOf(existing.projectId, existing._id, 1));
    const pending = this.pendingRound(1, actor.id, now, m, diff);
    const res = await this.reviews.updateOne(
      { _id: existing._id, status: 'draft' },
      {
        $set: {
          ...this.snapshot(m),
          pending,
          privacy: m.privacy,
          generator: m.generator,
          updatedAt: now,
        },
      },
    );
    if (res.matchedCount !== 1) throw STALE_STATUS();
    return envelope('reviews.draft_created', await this.draft(existing._id, 1, 'draft', pending));
  }

  /* ── Ronda nueva ────────────────────────────────────────────────── */

  addRound(
    principal: Principal,
    reviewId: string,
    key: string | undefined,
    manifest: Manifest,
  ): Promise<Envelope<ReviewDraft>> {
    return this.idempotency.run(
      principal.user.id,
      key,
      `POST /reviews/${reviewId}/rounds`,
      manifest,
      () => this.createRound(principal, reviewId, manifest),
    );
  }

  private async createRound(
    principal: Principal,
    reviewId: string,
    m: Manifest,
  ): Promise<Envelope<ReviewDraft>> {
    const actor = principal.user;
    const review = await this.skillReview(principal, reviewId);
    this.access.assert(actor, 'reviews:create', review.projectId);
    if (m.project !== review.projectId) {
      throw unprocessable(
        'manifest.review_mismatch',
        'El manifiesto es de otro proyecto que la revisión.',
      );
    }
    const project = await this.projectFor(actor, review.projectId);
    this.check(m, principal, project, review.pr.number);

    if (review.status === 'draft') {
      throw STALE_STATUS(
        'La ronda 1 todavía no se publicó: vuelve a crear la revisión o publícala.',
      );
    }
    if (!nextStatus('publish_round', review.status)) {
      throw STALE_STATUS(`La ronda ${review.round} sigue en revisión: espera el envío de diseño.`);
    }

    const n = review.round + 1;
    const diff = diffRound(
      review.screens,
      m.screens,
      n,
      this.keyOf(review.projectId, review._id, n),
    );
    if (!diff.changed.length) {
      throw unprocessable(
        'manifest.no_changes',
        'Ninguna pantalla cambió desde la ronda anterior.',
      );
    }
    const pending = this.pendingRound(n, actor.id, this.clock.now(), m, diff);
    const res = await this.reviews.updateOne(
      { _id: review._id, status: review.status, round: review.round },
      { $set: { pending, updatedAt: this.clock.now() } },
    );
    if (res.matchedCount !== 1) throw STALE_STATUS();
    return envelope(
      'reviews.round_created',
      await this.draft(review._id, n, review.status, pending),
    );
  }

  /* ── Publicar ───────────────────────────────────────────────────── */

  async publish(principal: Principal, reviewId: string): Promise<Envelope<ReviewDraft>> {
    const actor = principal.user;
    const review = await this.skillReview(principal, reviewId);
    this.access.assert(actor, 'reviews:create', review.projectId);

    const pending = review.pending;
    if (!pending) {
      // Reintento de un publish que ya salió: misma respuesta, sin efectos.
      const last = review.rounds.find((r) => r.n === review.round);
      return envelope('reviews.published', {
        id: review._id,
        round: review.round,
        status: review.status,
        uploads: [],
        changed: last?.changed ?? [],
        url: this.webUrl(review._id),
      });
    }

    const missing = await this.missingUploads(pending.uploads);
    if (missing.length) {
      throw unprocessable(
        'reviews.missing_uploads',
        `Faltan ${missing.length} capturas por subir o no coinciden con lo declarado.`,
        { missing },
      );
    }
    const next = nextStatus(review.status === 'draft' ? 'publish' : 'publish_round', review.status);
    if (!next) throw STALE_STATUS();

    const project = await this.projects.findById(review.projectId).lean();
    if (!project) throw REVIEW_NOT_FOUND();
    const first = pending.n === 1;
    const autoAssign = first || review.assignees.length === 0;
    const assignment = autoAssign
      ? assign(project.strategy, {
          candidates: await this.candidates(review.projectId),
          author: review.author,
          rules: project.moduleRules,
          routes: pending.screens.map((s) => s.route),
          roundRobinLast: project.roundRobinLast,
        })
      : { assignees: review.assignees, roundRobinLast: project.roundRobinLast };

    const now = this.clock.now();
    const verdicts = Object.fromEntries(pending.screens.map((s) => [s.key, s.verdict]));
    await this.tx.run(async (session) => {
      const doc = await this.reviews
        .findOneAndUpdate(
          { _id: review._id, status: review.status, 'pending.n': pending.n },
          {
            $set: {
              status: next,
              round: pending.n,
              title: pending.title,
              context: pending.context,
              module: pending.module,
              card: pending.card,
              pr: { ...pending.pr, check: 'pending' },
              summary: pending.summary,
              notCaptured: pending.notCaptured,
              screens: pending.screens,
              assignees: assignment.assignees,
              dueAt: dueFrom(now, project.slaDays),
              dueSoonNotifiedAt: null,
              overdueNotifiedAt: null,
              pending: null,
              updatedAt: now,
              ...(first ? { publishedAt: now } : {}),
            },
            $push: {
              rounds: {
                n: pending.n,
                by: pending.by,
                createdAt: now,
                note: pending.note,
                changed: pending.changed,
                verdicts,
                submission: null,
              },
            },
          },
          { new: true, session },
        )
        .lean();
      if (!doc) throw STALE_STATUS();
      if (assignment.roundRobinLast !== project.roundRobinLast) {
        await this.projects.updateOne(
          { _id: project._id },
          { roundRobinLast: assignment.roundRobinLast },
          { session },
        );
      }

      const target = { review: review._id };
      if (first) {
        await this.activity.log(
          'review_published',
          actor.id,
          review._id,
          `publicó la revisión (${pending.screens.length} pantallas)`,
          session,
        );
      } else {
        await this.activity.log(
          'round_uploaded',
          actor.id,
          review._id,
          `subió la ronda ${pending.n} desde la skill (${pending.changed.length} pantallas cambiaron)`,
          session,
        );
      }
      const assigned = autoAssign ? assignment.assignees : [];
      await this.notify.notifyMany(
        assigned,
        'review_assigned',
        actor.id,
        `Te asignaron ${review._id} · ${pending.title}`,
        target,
        session,
      );
      if (!first) {
        await this.notify.notifyMany(
          assignment.assignees.filter((a) => !assigned.includes(a)),
          'round_uploaded',
          actor.id,
          `${actor.name} subió la ronda ${pending.n} de ${review._id}`,
          target,
          session,
        );
      }
      await this.outbox.publish(
        'ReviewOpened',
        {
          reviewId: review._id,
          projectId: review.projectId,
          round: pending.n,
          title: pending.title,
          card: pending.card.key,
          pr: { number: pending.pr.number, url: pending.pr.url, commit: pending.pr.commit },
          screens: pending.screens.length,
          changed: pending.changed.length,
          by: actor.name,
          url: this.webUrl(review._id),
        },
        session,
      );
    });

    return envelope('reviews.published', {
      id: review._id,
      round: pending.n,
      status: next,
      uploads: [],
      changed: pending.changed,
      url: this.webUrl(review._id),
    });
  }

  /* ── Feedback para `/design-review status` ──────────────────────── */

  async feedback(principal: Principal, reviewId: string): Promise<Envelope<FeedbackStatus>> {
    const doc = await this.skillReview(principal, reviewId, { allowClosed: true });
    if (doc.status === 'draft') throw REVIEW_NOT_FOUND();
    const review = await this.mapper.toReview(doc);
    const n = lastSubmittedRound(review);
    const docs =
      n === null
        ? []
        : await this.comments
            .find({ reviewId: review.id, round: n, resolved: false })
            .sort({ createdAt: 1, _id: 1 })
            .lean();
    const comments = docs.map(toComment);

    const people = new Set<string>(
      comments.flatMap((c) => [c.author, ...c.replies.map((r) => r.author)]),
    );
    for (const r of review.rounds) if (r.submission) people.add(r.submission.by);
    const users = await this.users.find({ _id: { $in: [...people] } }, { name: 1 }).lean();
    const names = new Map(users.map((u) => [u._id, u.name]));

    return envelope('reviews.feedback', {
      review,
      comments,
      text: feedbackText(review, comments, names, this.webUrl(review.id)),
    });
  }

  /* ── Apoyo ──────────────────────────────────────────────────────── */

  /** El proyecto si la persona lo ve; con token, solo el del token. */
  private async projectFor(user: SessionUser, projectId: string): Promise<ProjectDoc> {
    const project = can(user, 'reviews:read', projectId)
      ? await this.projects.findById(projectId).lean()
      : null;
    if (!project) throw notFound('projects.not_found', 'Proyecto no encontrado.');
    return project;
  }

  /**
   * La revisión con su ronda pendiente, para la skill. 404 si no existe, si es de otro proyecto
   * que el del token, si la persona no la ve o si es un borrador ajeno; 409 si está cerrada
   * (salvo para leer).
   */
  private async skillReview(
    principal: Principal,
    reviewId: string,
    options: { allowClosed?: boolean } = {},
  ): Promise<ReviewDoc> {
    const doc = await this.reviews.findById(reviewId).lean();
    const hidden =
      !doc ||
      doc.status === 'expired' ||
      (principal.kind === 'token' && doc.projectId !== principal.projectId) ||
      !can(principal.user, 'reviews:read', doc.projectId) ||
      (doc.status === 'draft' && doc.author !== principal.user.id);
    if (!doc || hidden) throw REVIEW_NOT_FOUND();
    if (doc.status === 'closed' && !options.allowClosed)
      throw STALE_STATUS('La revisión está cerrada: el PR se cerró o se fusionó.');
    return doc;
  }

  private check(
    m: Manifest,
    principal: Principal,
    project: ProjectDoc,
    reviewPr: number | null,
  ): void {
    const problem = manifestProblem(m, {
      limits: project.limits ?? DEFAULT_LIMITS,
      tokenProject: principal.kind === 'token' ? principal.projectId : null,
      reviewPr,
    });
    if (problem) throw new ApiError(problem.status, problem.key, problem.message, problem.details);
  }

  private exists(prNumber: number, reviewId: string | null): ApiError {
    const which = reviewId ? ` (${reviewId})` : '';
    return conflict(
      'reviews.exists',
      `El PR #${prNumber} ya tiene una revisión activa${which}: sube una ronda nueva.`,
      reviewId ? { reviewId } : undefined,
    );
  }

  private snapshot(m: Manifest) {
    return {
      title: m.title,
      context: m.context,
      card: { ...m.card },
      pr: { ...m.pr, state: 'open' as const, check: null },
      module: moduleOf(m),
      summary: { steps: m.summary.steps.map((s) => ({ ...s })), rules: [...m.summary.rules] },
      notCaptured: notCapturedText(m),
    };
  }

  private pendingRound(
    n: number,
    by: string,
    now: Date,
    m: Manifest,
    diff: RoundDiff,
  ): PendingRound {
    const snap = this.snapshot(m);
    return {
      n,
      by,
      createdAt: now,
      note: n > 1 ? m.note : null,
      title: snap.title,
      context: snap.context,
      module: snap.module,
      card: snap.card,
      pr: snap.pr,
      summary: snap.summary,
      notCaptured: snap.notCaptured,
      screens: diff.screens,
      changed: diff.changed,
      uploads: diff.uploads,
    };
  }

  /** `projects/<p>/reviews/<id>/r<n>/<pantalla>/<after|before>.<png|webp>` (data-model.md). */
  private keyOf(projectId: string, reviewId: string, n: number): CaptureKeyOf {
    return (screenKey, kind, contentType) =>
      `projects/${projectId}/reviews/${reviewId}/r${n}/${screenKey}/${kind}.${EXTENSION[contentType] ?? 'png'}`;
  }

  private async draft(
    id: string,
    round: number,
    status: StoredReviewStatus,
    pending: PendingRound,
  ): Promise<ReviewDraft> {
    const uploads = await Promise.all(
      pending.uploads.map(async (u) => {
        const put = await this.storage.presignPut(
          u.capture.key,
          u.capture.contentType,
          u.capture.bytes,
        );
        return {
          screenKey: u.screenKey,
          kind: u.kind,
          url: put.url,
          headers: put.headers,
          expiresAt: put.expiresAt,
        };
      }),
    );
    return { id, round, status, uploads, changed: pending.changed, url: this.webUrl(id) };
  }

  /** Capturas que no están en el storage o no coinciden en tipo y tamaño con lo declarado. */
  private async missingUploads(uploads: readonly PendingUpload[]): Promise<string[]> {
    const checks = await Promise.all(
      uploads.map(async (u) => {
        const info = await this.storage.head(u.capture.key);
        const ok =
          info !== null &&
          info.bytes === u.capture.bytes &&
          info.contentType === u.capture.contentType;
        return ok ? null : `${u.screenKey}/${u.kind}`;
      }),
    );
    return checks.filter((c): c is string => c !== null);
  }

  private async candidates(projectId: string) {
    const members = await this.members.find({ projectId, role: { $in: REVIEWER_ROLES } }).lean();
    const active = await this.users
      .find({ _id: { $in: members.map((m) => m.userId) }, status: 'active' }, { _id: 1 })
      .lean();
    const ids = new Set(active.map((u) => u._id));
    return members.map((m) => ({ userId: m.userId, role: m.role, active: ids.has(m.userId) }));
  }

  private webUrl(reviewId: string): string {
    return `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/reviews/${reviewId}`;
  }
}
