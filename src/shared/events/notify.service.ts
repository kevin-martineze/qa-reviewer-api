import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';

import type { NotificationPrefs, NotificationType } from '../contract';
import { OutboxService } from '../outbox/outbox.service';
import { NotificationDoc, UserDoc } from '../schemas';
import { ClockService } from '../util/clock.service';

export const DEFAULT_PREFS: NotificationPrefs = {
  review_assigned: true,
  round_uploaded: true,
  review_submitted: true,
  mention: true,
  reply: false,
  due_soon: true,
  overdue: true,
};

export interface NotifyTarget {
  review?: string;
  screen?: string;
  comment?: string;
}

/**
 * Notificaciones in-app (siempre) y por correo (según las preferencias). El correo sale por
 * el outbox: si el proveedor falla, la notificación in-app ya quedó.
 */
@Injectable()
export class NotifyService {
  constructor(
    @InjectModel(NotificationDoc.name) private readonly notifications: Model<NotificationDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    private readonly outbox: OutboxService,
    private readonly clock: ClockService,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    actor: string | null,
    text: string,
    target: NotifyTarget = {},
    session?: ClientSession,
  ): Promise<void> {
    // Nadie se notifica a sí mismo.
    if (actor === userId) return;
    const user = await this.users.findById(userId, null, { session }).lean();
    if (!user || user.status !== 'active') return;

    const [created] = await this.notifications.create(
      [
        {
          userId,
          type,
          actor,
          review: target.review ?? null,
          screen: target.screen ?? null,
          comment: target.comment ?? null,
          text,
          createdAt: this.clock.now(),
        },
      ],
      { session },
    );
    const prefs = { ...DEFAULT_PREFS, ...(user.notificationPrefs ?? {}) };
    if (created && prefs[type]) {
      await this.outbox.publish(
        'NotificationCreated',
        { notificationId: created._id, userId, email: user.email, name: user.name, type, text, ...target },
        session,
      );
    }
  }

  async notifyMany(
    userIds: Iterable<string>,
    type: NotificationType,
    actor: string | null,
    text: string,
    target: NotifyTarget = {},
    session?: ClientSession,
  ): Promise<void> {
    for (const id of new Set(userIds)) await this.notify(id, type, actor, text, target, session);
  }
}
