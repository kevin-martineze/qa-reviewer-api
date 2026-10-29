import type { ReviewFilters } from './review-query';
import type { Principal } from '../../shared/auth/principal';
import type {
  ActivityEvent,
  PaginatedResponse,
  Priority,
  Review,
  SessionUser,
} from '../../shared/contract';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../shared/auth/access.service';
import { can, isOrgAdmin } from '../../shared/auth/permissions';
import { ActivityService } from '../../shared/events/activity.service';
import { NotifyService } from '../../shared/events/notify.service';
import { badRequest, conflict, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { ActivityDoc, MemberDoc, ProjectDoc, ReviewDoc, UserDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { TransactionService } from '../../shared/util/transaction.service';

import { invalidAssignees } from './domain/assignees';
import { dueFrom } from './domain/due';
import { nextStatus, PUBLISHED_STATUSES } from './domain/review-state';
import { reviewListPipeline } from './review-query';
import { ReviewMapper, toActivity } from './reviews.mapper';

export const REVIEW_NOT_FOUND = () =>
  notFound('reviews.not_found', 'Esta revisión no existe o fue eliminada.');
export const STALE_STATUS = (message = 'La revisión cambió de estado. Recarga la página.') =>
  conflict('reviews.stale_status', message);

/** Lo que la web lee de la revisión: la ronda pendiente de la skill no sale. */
const READ_PROJECTION = { pending: 0 } as const;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(ReviewDoc.name) private readonly reviews: Model<ReviewDoc>,
    @InjectModel(ActivityDoc.name) private readonly activityLog: Model<ActivityDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly mapper: ReviewMapper,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly outbox: OutboxService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  /** La revisión publicada si la persona puede leerla; si no, «no existe» (404). */
  async findVisible(user: SessionUser, reviewId: string): Promise<ReviewDoc> {
    const doc = await this.reviews
      .findOne({ _id: reviewId, status: { $in: PUBLISHED_STATUSES } }, READ_PROJECTION)
      .lean();
    if (!doc || !can(user, 'reviews:read', doc.projectId)) throw REVIEW_NOT_FOUND();
    return doc;
  }

  async list(
    principal: Principal,
    filters: ReviewFilters,
  ): Promise<Envelope<PaginatedResponse<Review>>> {
    const user = principal.user;
    const visible = isOrgAdmin(user) ? null : user.memberships.map((m) => m.projectId);
    const [page] = await this.reviews.aggregate<{ items: ReviewDoc[]; total: { n: number }[] }>(
      reviewListPipeline(filters, visible, this.clock.now()),
    );
    return envelope('reviews.list', {
      items: await this.mapper.toReviews(page?.items ?? []),
      pagination: { page: filters.page, limit: filters.limit, total: page?.total[0]?.n ?? 0 },
    });
  }

  async get(principal: Principal, reviewId: string): Promise<Envelope<Review>> {
    const doc = await this.findVisible(principal.user, reviewId);
    return envelope('reviews.get', await this.mapper.toReview(doc));
  }

  async listActivity(principal: Principal, reviewId: string): Promise<Envelope<ActivityEvent[]>> {
    const review = await this.findVisible(principal.user, reviewId);
    const docs = await this.activityLog
      .find({ review: review._id })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return envelope('reviews.activity', docs.map(toActivity));
  }

  async assign(
    principal: Principal,
    reviewId: string,
    assignees: string[],
  ): Promise<Envelope<Review>> {
    const actor = principal.user;
    const review = await this.findVisible(actor, reviewId);
    this.access.assert(actor, 'reviews:assign', review.projectId);
    if (review.status === 'closed') throw STALE_STATUS('La revisión está cerrada.');

    const [members, users] = await Promise.all([
      this.members.find({ projectId: review.projectId, userId: { $in: assignees } }).lean(),
      this.users.find({ _id: { $in: assignees } }, { name: 1, status: 1 }).lean(),
    ]);
    const active = new Set(users.filter((u) => u.status === 'active').map((u) => u._id));
    const invalid = invalidAssignees(
      assignees,
      members.map((m) => ({ userId: m.userId, role: m.role, active: active.has(m.userId) })),
      review.author,
    );
    if (invalid) {
      throw badRequest('reviews.invalid_assignees', 'Elige diseñadores del proyecto.', {
        userIds: invalid,
      });
    }

    const names = new Map(users.map((u) => [u._id, u.name]));
    const before = new Set(review.assignees);
    const target = { review: review._id };
    const updated = await this.tx.run(async (session) => {
      const doc = await this.reviews
        .findOneAndUpdate(
          { _id: review._id, status: review.status },
          { $set: { assignees, updatedAt: this.clock.now() } },
          { new: true, session, projection: READ_PROJECTION },
        )
        .lean();
      if (!doc) throw STALE_STATUS();
      const removed = review.assignees.filter((a) => !assignees.includes(a));
      const added = assignees.filter((a) => !before.has(a));
      await this.notify.notifyMany(
        removed,
        'review_assigned',
        actor.id,
        `${actor.name} te quitó de ${review._id}`,
        target,
        session,
      );
      await this.notify.notifyMany(
        added,
        'review_assigned',
        actor.id,
        `${actor.name} te asignó ${review._id} · ${review.title}`,
        target,
        session,
      );
      await this.activity.log(
        'review_assigned',
        actor.id,
        review._id,
        `asignó la revisión a ${assignees.map((a) => names.get(a) ?? a).join(', ')}`,
        session,
      );
      return doc;
    });
    return envelope('reviews.assigned', await this.mapper.toReview(updated));
  }

  async setPriority(
    principal: Principal,
    reviewId: string,
    priority: Priority,
  ): Promise<Envelope<Review>> {
    const actor = principal.user;
    const review = await this.findVisible(actor, reviewId);
    this.access.assert(actor, 'reviews:assign', review.projectId);
    if (review.status === 'closed') throw STALE_STATUS('La revisión está cerrada.');
    if (review.priority === priority) {
      return envelope('reviews.priority_set', await this.mapper.toReview(review));
    }
    const updated = await this.reviews
      .findOneAndUpdate(
        { _id: review._id, status: review.status },
        { $set: { priority, updatedAt: this.clock.now() } },
        { new: true, projection: READ_PROJECTION },
      )
      .lean();
    if (!updated) throw STALE_STATUS();
    return envelope('reviews.priority_set', await this.mapper.toReview(updated));
  }

  /** Anula el último envío: diseño vuelve a tener la pelota, con plazo nuevo. */
  async reopen(principal: Principal, reviewId: string, reason: string): Promise<Envelope<Review>> {
    const actor = principal.user;
    const review = await this.findVisible(actor, reviewId);
    this.access.assert(actor, 'reviews:reopen', review.projectId);
    const next = nextStatus('reopen', review.status);
    if (!next) throw STALE_STATUS('Solo se reabre una revisión ya enviada.');

    const project = await this.projects.findById(review.projectId, { slaDays: 1 }).lean();
    const now = this.clock.now();
    const dueAt = dueFrom(now, project?.slaDays ?? 2);
    const updated = await this.tx.run(async (session) => {
      const doc = await this.reviews
        .findOneAndUpdate(
          { _id: review._id, status: review.status, round: review.round },
          {
            $set: {
              status: next,
              'pr.check': 'pending',
              'rounds.$[last].submission': null,
              dueAt,
              dueSoonNotifiedAt: null,
              overdueNotifiedAt: null,
              updatedAt: now,
            },
          },
          {
            arrayFilters: [{ 'last.n': review.round }],
            new: true,
            session,
            projection: READ_PROJECTION,
          },
        )
        .lean();
      if (!doc) throw STALE_STATUS();
      await this.activity.log(
        'review_reopened',
        actor.id,
        review._id,
        `anuló el envío: «${reason}»`,
        session,
      );
      await this.notify.notify(
        review.author,
        'review_submitted',
        actor.id,
        `${actor.name} reabrió ${review._id}`,
        { review: review._id },
        session,
      );
      await this.outbox.publish(
        'ReviewReopened',
        {
          reviewId: review._id,
          projectId: review.projectId,
          round: review.round,
          card: review.card.key,
          pr: { number: review.pr.number, url: review.pr.url, commit: review.pr.commit },
          reason,
          by: actor.name,
          url: `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/reviews/${review._id}`,
        },
        session,
      );
      return doc;
    });
    return envelope('reviews.reopened', await this.mapper.toReview(updated));
  }
}
