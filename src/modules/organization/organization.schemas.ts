import type { AuditType } from '../../shared/contract';

import * as Joi from 'joi';

import { email, id, limit, membership, orgRole, page, userStatus } from '../../shared/validation';

export const AUDIT_TYPES: readonly AuditType[] = [
  'user_invited',
  'user_deactivated',
  'user_reactivated',
  'role_changed',
  'member_added',
  'member_removed',
  'token_created',
  'token_revoked',
  'project_updated',
];

/** Estado o rol, nunca los dos en la misma petición. */
export const userPatchSchema = Joi.object({
  status: userStatus,
  orgRole,
}).xor('status', 'orgRole');

export const invitationSchema = Joi.object({
  email: email.required(),
  role: orgRole.required(),
  projects: Joi.array().items(membership).unique('projectId').max(50).default([]),
});

export const auditQuerySchema = Joi.object({
  type: Joi.string().valid(...AUDIT_TYPES),
  actor: id,
  page,
  limit,
});
