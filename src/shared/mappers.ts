import type { Invitation, InviteStatus, User } from './contract';
import type { InvitationDoc, UserDoc } from './schemas';

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
