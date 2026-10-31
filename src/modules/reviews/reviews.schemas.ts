import * as Joi from 'joi';

import { id, limit, page } from '../../shared/validation';

export const REVIEW_STATUSES = [
  'draft',
  'open',
  'in_review',
  'changes_requested',
  'approved',
  'closed',
] as const;
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;

/** `status` se repite (`status=open&status=in_review`) o viene una sola vez. */
export const reviewListQuerySchema = Joi.object({
  status: Joi.array()
    .items(Joi.string().valid(...REVIEW_STATUSES))
    .single(),
  project: id,
  author: id,
  assignee: id,
  priority: Joi.string().valid(...PRIORITIES),
  overdue: Joi.boolean(),
  q: Joi.string().trim().max(100).allow(''),
  sort: Joi.string().valid('updated', 'due', 'priority').default('updated'),
  page,
  limit,
});

export const assigneesSchema = Joi.object({
  assignees: Joi.array().items(id).unique().max(10).required(),
});

export const prioritySchema = Joi.object({
  priority: Joi.string()
    .valid(...PRIORITIES)
    .required(),
});

export const reopenSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(500).required(),
});

/** `GET /skill/reviews?pr=`. */
export const prQuerySchema = Joi.object({ pr: Joi.number().integer().min(1).required() });
