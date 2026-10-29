import type {
  ApiToken,
  AuditEvent,
  Comment,
  Invitation,
  InviteStatus,
  Notification,
  Organization,
  Project,
  ProjectMember,
  User,
} from './contract';
import type {
  ApiTokenDoc,
  AuditDoc,
  CommentDoc,
  InvitationDoc,
  MemberDoc,
  NotificationDoc,
  OrganizationDoc,
  ProjectDoc,
  UserDoc,
} from './schemas';

import { iso } from './util/dates';

export function toUser(doc: UserDoc): User {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    orgRole: doc.orgRole,
    status: doc.status,
    avatar: doc.avatar,
    lastSeenAt: iso(doc.lastSeenAt),
    createdAt: iso(doc.createdAt),
  };
}

export function inviteStatus(doc: InvitationDoc, now: Date): InviteStatus {
  if (doc.revokedAt) return 'revoked';
  if (doc.usedAt) return 'used';
  if (doc.expiresAt.getTime() < now.getTime()) return 'expired';
  return 'valid';
}

export function toInvitation(doc: InvitationDoc, now: Date): Invitation {
  return {
    id: doc._id,
    email: doc.email,
    role: doc.role,
    projects: doc.projects.map((p) => ({ projectId: p.projectId, role: p.role })),
    invitedBy: doc.invitedBy,
    createdAt: iso(doc.createdAt),
    expiresAt: iso(doc.expiresAt),
    status: inviteStatus(doc, now),
  };
}

export function toOrganization(doc: OrganizationDoc): Organization {
  return { id: doc._id, name: doc.name };
}

export function toProject(doc: ProjectDoc, reviewsCount: number): Project {
  return {
    id: doc._id,
    name: doc.name,
    repo: doc.repo,
    planeKey: doc.planeKey,
    slaDays: doc.slaDays,
    strategy: doc.strategy,
    moduleRules: doc.moduleRules.map((r) => ({ pattern: r.pattern, userId: r.userId })),
    integrations: {
      github: { ...doc.integrations.github },
      plane: { ...doc.integrations.plane },
    },
    maskSelectors: [...doc.maskSelectors],
    designRules: [...doc.designRules],
    reviewsCount,
  };
}

export function toMember(doc: MemberDoc): ProjectMember {
  return { userId: doc.userId, projectId: doc.projectId, role: doc.role };
}

export function toAuditEvent(doc: AuditDoc): AuditEvent {
  return {
    id: doc._id,
    type: doc.type,
    actor: doc.actor,
    target: doc.target,
    text: doc.text,
    createdAt: iso(doc.createdAt),
  };
}

export function toComment(doc: CommentDoc): Comment {
  return {
    id: doc._id,
    review: doc.reviewId,
    screen: doc.screenKey,
    round: doc.round,
    author: doc.author,
    createdAt: iso(doc.createdAt),
    body: doc.body,
    anchor: doc.anchor ? { x: doc.anchor.x, y: doc.anchor.y } : null,
    el: doc.el ? { ...doc.el } : null,
    resolved: doc.resolved,
    followUp: doc.followUp,
    replies: doc.replies.map((r) => ({
      id: r.id,
      author: r.author,
      createdAt: iso(r.createdAt),
      body: r.body,
    })),
  };
}

export function toNotification(doc: NotificationDoc): Notification {
  return {
    id: doc._id,
    type: doc.type,
    actor: doc.actor,
    review: doc.review,
    screen: doc.screen,
    comment: doc.comment,
    text: doc.text,
    createdAt: iso(doc.createdAt),
    readAt: iso(doc.readAt),
  };
}

export function toApiToken(doc: ApiTokenDoc): ApiToken {
  return {
    id: doc._id,
    label: doc.label,
    prefix: doc.prefix,
    project: doc.projectId,
    createdAt: iso(doc.createdAt),
    lastUsedAt: iso(doc.lastUsedAt),
  };
}
