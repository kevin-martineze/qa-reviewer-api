import { ApiTokenDoc, ApiTokenSchema } from './api-token.schema';
import { CommentDoc, CommentSchema } from './comment.schema';
import { DeviceDoc, DeviceSchema, RateLimitDoc, RateLimitSchema } from './device.schema';
import { InvitationDoc, InvitationSchema, RecoveryDoc, RecoverySchema } from './invitation.schema';
import { ActivityDoc, ActivitySchema, AuditDoc, AuditSchema } from './log.schema';
import { NotificationDoc, NotificationSchema } from './notification.schema';
import { OrganizationDoc, OrganizationSchema } from './organization.schema';
import { IdempotencyDoc, IdempotencySchema, OutboxDoc, OutboxSchema } from './outbox.schema';
import { MemberDoc, MemberSchema, ProjectDoc, ProjectSchema } from './project.schema';
import { CounterDoc, CounterSchema, ReviewDoc, ReviewSchema } from './review.schema';
import { SessionDoc, SessionSchema } from './session.schema';
import { CredentialDoc, CredentialSchema, UserDoc, UserSchema } from './user.schema';

export * from './api-token.schema';
export * from './comment.schema';
export * from './device.schema';
export * from './invitation.schema';
export * from './log.schema';
export * from './notification.schema';
export * from './organization.schema';
export * from './outbox.schema';
export * from './project.schema';
export * from './review.schema';
export * from './session.schema';
export * from './user.schema';

/** Todas las colecciones: el módulo de base de datos las registra una vez y son globales. */
export const MODELS = [
  { name: OrganizationDoc.name, schema: OrganizationSchema },
  { name: UserDoc.name, schema: UserSchema },
  { name: CredentialDoc.name, schema: CredentialSchema },
  { name: SessionDoc.name, schema: SessionSchema },
  { name: ApiTokenDoc.name, schema: ApiTokenSchema },
  { name: ProjectDoc.name, schema: ProjectSchema },
  { name: MemberDoc.name, schema: MemberSchema },
  { name: InvitationDoc.name, schema: InvitationSchema },
  { name: RecoveryDoc.name, schema: RecoverySchema },
  { name: ReviewDoc.name, schema: ReviewSchema },
  { name: CounterDoc.name, schema: CounterSchema },
  { name: CommentDoc.name, schema: CommentSchema },
  { name: DeviceDoc.name, schema: DeviceSchema },
  { name: RateLimitDoc.name, schema: RateLimitSchema },
  { name: NotificationDoc.name, schema: NotificationSchema },
  { name: ActivityDoc.name, schema: ActivitySchema },
  { name: AuditDoc.name, schema: AuditSchema },
  { name: OutboxDoc.name, schema: OutboxSchema },
  { name: IdempotencyDoc.name, schema: IdempotencySchema },
];
