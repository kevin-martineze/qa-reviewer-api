import type { Principal } from '../../shared/auth/principal';
import type {
  Anchor,
  Comment,
  CommentReply,
  ElementRef,
  Review,
  SessionUser,
  Verdict,
} from '../../shared/contract';
import type { ClientSession, Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { AccessService } from '../../shared/auth/access.service';
import { can } from '../../shared/auth/permissions';
import { ActivityService } from '../../shared/events/activity.service';
import { NotifyService } from '../../shared/events/notify.service';
import { ApiError, conflict, forbidden, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toComment } from '../../shared/mappers';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { CommentDoc, MemberDoc, ReviewDoc, UserDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { iso } from '../../shared/util/dates';
import { newId } from '../../shared/util/ids';
import { TransactionService } from '../../shared/util/transaction.service';
import { nextStatus } from '../reviews/domain/review-state';
import { ReviewMapper } from '../reviews/reviews.mapper';
import { ReviewsService, STALE_STATUS } from '../reviews/reviews.service';

import { findMentions } from './domain/mentions';
import { submissionSummary, tally } from './domain/submission';

export interface NewComment {
  body: string;
  anchor: Anchor | null;
  el: ElementRef | null;
}

const COMMENT_NOT_FOUND = () => notFound('comments.not_found', 'Comentario no encontrado.');
const SCREEN_NOT_FOUND = () => notFound('screens.not_found', 'Pantalla no encontrada.');
const CLOSED = () => STALE_STATUS('La revisión está cerrada.');

/** Veredictos, envío y comentarios de una revisión. */
@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(ReviewDoc.name) private readonly reviewModel: Model<ReviewDoc>,
    @InjectModel(CommentDoc.name) private readonly comments: Model<CommentDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @Inject(ENV) private readonly env: Env,
    private readonly reviews: ReviewsService,
    private readonly mapper: ReviewMapper,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly outbox: OutboxService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  /* ── Veredictos y envío ─────────────────────────────────────────── */

  async setVerdict(
    principal: Principal,
    reviewId: string,
    screenKey: string,
    verdict: Verdict,
  ): Promise<Envelope<Review>> {
    const actor = principal.user;
    const review = await this.forReviewer(
      actor,
      reviewId,
      'El autor no puede dar veredicto a su propia revisión.',
    );
    if (!review.screens.some((s) => s.key === screenKey)) throw SCREEN_NOT_FOUND();

    // El primer veredicto de la ronda pasa la revisión a in_review.
    const status = nextStatus('start_review', review.status) ?? review.status;
    const updated = await this.reviewModel
      .findOneAndUpdate(
        { _id: review._id, status: review.status, round: review.round },
        {
          $set: {
            status,
            'screens.$[s].verdict': verdict,
            // Un veredicto dado en esta ronda reemplaza al heredado.
            'screens.$[s].inherited': false,
            updatedAt: this.clock.now(),
          },
        },
        { arrayFilters: [{ 's.key': screenKey }], new: true, projection: { pending: 0 } },
      )
      .lean();
    if (!updated) throw STALE_STATUS();
    return envelope('verdicts.set', await this.mapper.toReview(updated));
  }

  async submit(
    principal: Principal,
    reviewId: string,
    body: string | null,
  ): Promise<Envelope<Review>> {
    const actor = principal.user;
    const review = await this.forReviewer(
      actor,
      reviewId,
      'El autor no puede enviar su propia revisión.',
    );
    const t = tally(review.screens);
    if (t.pending.length) {
      throw conflict('reviews.pending_screens', 'Quedan pantallas sin veredicto.', {
        screens: t.pending,
      });
    }
    const next = nextStatus('submit', review.status, t.result);
    if (!next) throw STALE_STATUS();

    const now = this.clock.now();
    const summary = submissionSummary(review.round, t);
    const updated = await this.tx.run(async (session) => {
      const doc = await this.reviewModel
        .findOneAndUpdate(
          { _id: review._id, status: review.status, round: review.round },
          {
            $set: {
              status: next,
              'pr.check': t.result === 'approved' ? 'success' : 'failure',
              'rounds.$[r].verdicts': t.verdicts,
              'rounds.$[r].submission': {
                by: actor.id,
                createdAt: now,
                result: t.result,
                approved: t.approved,
                changes: t.changes,
                body,
              },
              updatedAt: now,
            },
          },
          {
            arrayFilters: [{ 'r.n': review.round }],
            new: true,
            session,
            projection: { pending: 0 },
          },
        )
        .lean();
      if (!doc) throw STALE_STATUS();
      await this.activity.log('review_submitted', actor.id, review._id, summary, session);
      await this.notify.notify(
        review.author,
        'review_submitted',
        actor.id,
        `${actor.name} ${summary} de ${review._id}`,
        { review: review._id },
        session,
      );
      await this.outbox.publish(
        'ReviewSubmitted',
        {
          reviewId: review._id,
          projectId: review.projectId,
          round: review.round,
          result: t.result,
          approved: t.approved,
          changes: t.changes,
          body,
          by: actor.name,
          card: review.card.key,
          pr: { number: review.pr.number, url: review.pr.url, commit: review.pr.commit },
          screens: review.screens.map((s) => ({ key: s.key, title: s.title, verdict: s.verdict })),
          url: `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/reviews/${review._id}`,
        },
        session,
      );
      return doc;
    });
    return envelope('reviews.submitted', await this.mapper.toReview(updated));
  }

  /* ── Comentarios ────────────────────────────────────────────────── */

  async list(
    principal: Principal,
    reviewId: string,
    screenKey?: string,
  ): Promise<Envelope<Comment[]>> {
    const review = await this.reviews.findVisible(principal.user, reviewId);
    const filter: { reviewId: string; screenKey?: string } = { reviewId: review._id };
    if (screenKey !== undefined) filter.screenKey = screenKey;
    const docs = await this.comments.find(filter).sort({ createdAt: 1, _id: 1 }).lean();
    return envelope('comments.list', docs.map(toComment));
  }

  async add(
    principal: Principal,
    reviewId: string,
    screenKey: string,
    input: NewComment,
  ): Promise<Envelope<Comment>> {
    const actor = principal.user;
    const review = await this.reviews.findVisible(actor, reviewId);
    this.access.assert(actor, 'comments:create', review.projectId);
    if (review.status === 'closed') throw CLOSED();
    const screen = review.screens.find((s) => s.key === screenKey);
    if (!screen) throw SCREEN_NOT_FOUND();

    const now = this.clock.now();
    const comment = await this.tx.run(async (session) => {
      const [doc] = await this.comments.create(
        [
          {
            reviewId: review._id,
            screenKey,
            round: review.round,
            author: actor.id,
            body: input.body,
            anchor: input.anchor,
            el: input.el,
            createdAt: now,
          },
        ],
        { session },
      );
      if (!doc) throw new Error('No se creó el comentario');
      await this.touch(review._id, session);
      await this.activity.log(
        'comment_created',
        actor.id,
        review._id,
        `comentó en «${screen.title}»`,
        session,
      );
      const target = { review: review._id, screen: screenKey, comment: doc._id };
      const mentioned = await this.mentioned(review, input.body);
      await this.notify.notifyMany(
        mentioned,
        'mention',
        actor.id,
        `${actor.name} te mencionó en «${screen.title}»`,
        target,
        session,
      );
      if (!mentioned.includes(review.author)) {
        await this.notify.notify(
          review.author,
          'reply',
          actor.id,
          `${actor.name} comentó en «${screen.title}»`,
          target,
          session,
        );
      }
      return doc.toObject();
    });
    return envelope('comments.created', toComment(comment));
  }

  async reply(
    principal: Principal,
    commentId: string,
    body: string,
  ): Promise<Envelope<CommentReply>> {
    const actor = principal.user;
    const { comment, review } = await this.findComment(actor, commentId);
    this.access.assert(actor, 'comments:create', review.projectId);
    if (review.status === 'closed') throw CLOSED();

    const reply = { id: newId(), author: actor.id, createdAt: this.clock.now(), body };
    await this.tx.run(async (session) => {
      const res = await this.comments.updateOne(
        { _id: comment._id },
        { $push: { replies: reply } },
        { session },
      );
      if (res.matchedCount !== 1) throw COMMENT_NOT_FOUND();
      await this.touch(review._id, session);
      await this.activity.log(
        'comment_replied',
        actor.id,
        review._id,
        'respondió un comentario',
        session,
      );
      const target = { review: review._id, screen: comment.screenKey, comment: comment._id };
      const mentioned = await this.mentioned(review, body);
      await this.notify.notifyMany(
        mentioned,
        'mention',
        actor.id,
        `${actor.name} te mencionó en una respuesta`,
        target,
        session,
      );
      if (!mentioned.includes(comment.author)) {
        await this.notify.notify(
          comment.author,
          'reply',
          actor.id,
          `${actor.name} respondió tu comentario`,
          target,
          session,
        );
      }
    });
    return envelope('comments.replied', { ...reply, createdAt: iso(reply.createdAt) });
  }

  async resolve(
    principal: Principal,
    commentId: string,
    resolved: boolean,
  ): Promise<Envelope<Comment>> {
    const actor = principal.user;
    const { comment, review } = await this.findComment(actor, commentId);
    if (comment.author !== actor.id && !can(actor, 'comments:resolve', review.projectId)) {
      throw forbidden('comments.forbidden', 'No puedes resolver este comentario.', {
        permission: 'comments:resolve',
      });
    }
    const updated = await this.tx.run(async (session) => {
      const doc = await this.comments
        .findByIdAndUpdate(comment._id, { resolved }, { new: true, session })
        .lean();
      if (!doc) throw COMMENT_NOT_FOUND();
      if (resolved && !comment.resolved) {
        await this.activity.log(
          'comment_resolved',
          actor.id,
          review._id,
          'resolvió un comentario',
          session,
        );
      }
      return doc;
    });
    return envelope('comments.updated', toComment(updated));
  }

  /** «¿Quedó resuelto en la ronda N?»: solo sobre comentarios de rondas anteriores. */
  async setFollowUp(
    principal: Principal,
    commentId: string,
    followUp: 'resolved' | 'still',
  ): Promise<Envelope<Comment>> {
    const actor = principal.user;
    const { comment, review } = await this.findComment(actor, commentId);
    this.access.assert(actor, 'verdicts:set', review.projectId);
    if (comment.round >= review.round) {
      throw conflict('comments.not_previous_round', 'El comentario es de esta ronda.');
    }
    const updated = await this.tx.run(async (session) => {
      const doc = await this.comments
        .findByIdAndUpdate(
          comment._id,
          { followUp, resolved: followUp === 'resolved' },
          { new: true, session },
        )
        .lean();
      if (!doc) throw COMMENT_NOT_FOUND();
      await this.activity.log(
        followUp === 'resolved' ? 'comment_resolved' : 'comment_replied',
        actor.id,
        review._id,
        followUp === 'resolved'
          ? `confirmó que un comentario de la ronda ${comment.round} quedó resuelto`
          : `indicó que un comentario de la ronda ${comment.round} sigue igual`,
        session,
      );
      return doc;
    });
    return envelope('comments.follow_up_set', toComment(updated));
  }

  async remove(principal: Principal, commentId: string): Promise<void> {
    const actor = principal.user;
    const { comment, review } = await this.findComment(actor, commentId);
    if (comment.author !== actor.id && !can(actor, 'comments:moderate', review.projectId)) {
      throw forbidden('comments.forbidden', 'No puedes borrar este comentario.', {
        permission: 'comments:moderate',
      });
    }
    await this.comments.deleteOne({ _id: comment._id });
  }

  /* ── Apoyo ──────────────────────────────────────────────────────── */

  /**
   * La revisión para dar veredicto o enviar: permiso `verdicts:set`, nunca el autor, y la
   * ronda sin enviar.
   */
  private async forReviewer(
    actor: SessionUser,
    reviewId: string,
    authorMessage: string,
  ): Promise<ReviewDoc> {
    const review = await this.reviews.findVisible(actor, reviewId);
    this.access.assert(actor, 'verdicts:set', review.projectId);
    if (review.status === 'closed') throw CLOSED();
    if (review.author === actor.id) throw forbidden('verdicts.author_forbidden', authorMessage);
    if (review.status === 'approved' || review.status === 'changes_requested') {
      throw conflict('reviews.already_submitted', 'Esta ronda ya se envió.');
    }
    return review;
  }

  /** El comentario y su revisión; si la persona no ve la revisión, el comentario «no existe». */
  private async findComment(actor: SessionUser, commentId: string) {
    const comment = await this.comments.findById(commentId).lean();
    if (!comment) throw COMMENT_NOT_FOUND();
    try {
      const review = await this.reviews.findVisible(actor, comment.reviewId);
      return { comment, review };
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) throw COMMENT_NOT_FOUND();
      throw error;
    }
  }

  /** Personas mencionadas que ven el proyecto: miembros activos, owner y admin. */
  private async mentioned(review: ReviewDoc, body: string): Promise<string[]> {
    if (!body.includes('@')) return [];
    const members = await this.members.find({ projectId: review.projectId }, { userId: 1 }).lean();
    const people = await this.users
      .find(
        {
          status: 'active',
          $or: [
            { _id: { $in: members.map((m) => m.userId) } },
            { orgRole: { $in: ['owner', 'admin'] } },
          ],
        },
        { name: 1, email: 1 },
      )
      .lean();
    return findMentions(
      body,
      people.map((p) => ({ id: p._id, name: p.name, email: p.email })),
    );
  }

  private async touch(reviewId: string, session: ClientSession): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: reviewId },
      { updatedAt: this.clock.now() },
      { session },
    );
  }
}
