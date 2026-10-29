import type { Principal } from '../../shared/auth/principal';
import type { Notification, NotificationPrefs } from '../../shared/contract';
import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { DEFAULT_PREFS } from '../../shared/events/notify.service';
import { notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toNotification } from '../../shared/mappers';
import { NotificationDoc, UserDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';

export interface NotificationFilters {
  unread: boolean;
  mentions: boolean;
}

/** Tope de la bandeja: las más recientes. El contador de no leídas no tiene tope. */
export const INBOX_LIMIT = 200;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(NotificationDoc.name) private readonly notifications: Model<NotificationDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    private readonly clock: ClockService,
  ) {}

  async list(
    principal: Principal,
    filters: NotificationFilters,
  ): Promise<Envelope<Notification[]>> {
    const filter: { userId: string; readAt?: null; type?: 'mention' } = {
      userId: principal.user.id,
    };
    if (filters.unread) filter.readAt = null;
    if (filters.mentions) filter.type = 'mention';
    const docs = await this.notifications
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(INBOX_LIMIT)
      .lean();
    return envelope('notifications.list', docs.map(toNotification));
  }

  async unreadCount(principal: Principal): Promise<Envelope<number>> {
    const count = await this.notifications.countDocuments({
      userId: principal.user.id,
      readAt: null,
    });
    return envelope('notifications.unread_count', count);
  }

  /** Marcar como leída otra vez no cambia la fecha de lectura. */
  async markRead(principal: Principal, id: string): Promise<void> {
    const res = await this.notifications.updateOne({ _id: id, userId: principal.user.id }, [
      { $set: { readAt: { $ifNull: ['$readAt', this.clock.now()] } } },
    ]);
    if (res.matchedCount !== 1) {
      throw notFound('notifications.not_found', 'Notificación no encontrada.');
    }
  }

  async markAllRead(principal: Principal): Promise<void> {
    await this.notifications.updateMany(
      { userId: principal.user.id, readAt: null },
      { readAt: this.clock.now() },
    );
  }

  async prefs(principal: Principal): Promise<Envelope<NotificationPrefs>> {
    const user = await this.users.findById(principal.user.id, { notificationPrefs: 1 }).lean();
    return envelope('notifications.prefs', {
      ...DEFAULT_PREFS,
      ...(user?.notificationPrefs ?? {}),
    });
  }

  async updatePrefs(
    principal: Principal,
    prefs: NotificationPrefs,
  ): Promise<Envelope<NotificationPrefs>> {
    await this.users.updateOne({ _id: principal.user.id }, { notificationPrefs: prefs });
    return envelope('notifications.prefs_updated', { ...DEFAULT_PREFS, ...prefs });
  }
}
