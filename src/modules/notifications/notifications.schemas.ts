import type { NotificationType } from '../../shared/contract';

import * as Joi from 'joi';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'review_assigned',
  'round_uploaded',
  'review_submitted',
  'mention',
  'reply',
  'due_soon',
  'overdue',
];

export const notificationListQuerySchema = Joi.object({
  unread: Joi.boolean().default(false),
  mentions: Joi.boolean().default(false),
});

/** El objeto completo: un tipo por clave, todos obligatorios. */
export const notificationPrefsSchema = Joi.object(
  Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, Joi.boolean().required()])),
);
