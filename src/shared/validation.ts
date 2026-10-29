// Esquemas Joi reutilizables entre módulos.
import * as Joi from 'joi';

import { PASSWORD_MIN } from './auth/passwords';
import { ORG_ROLES, PROJECT_ROLES } from './auth/permissions';

export const AVATAR_IDS = [
  'a01',
  'a02',
  'a03',
  'a04',
  'a05',
  'a06',
  'a07',
  'a08',
  'a09',
  'a10',
  'a11',
  'a12',
];

export const email = Joi.string().trim().lowercase().email({ tlds: false }).max(254);
export const password = Joi.string().min(PASSWORD_MIN).max(200);
export const personName = Joi.string().trim().min(1).max(80);
export const avatar = Joi.string()
  .valid(...AVATAR_IDS)
  .allow(null);
export const orgRole = Joi.string().valid(...ORG_ROLES);
export const projectRole = Joi.string().valid(...PROJECT_ROLES);
export const id = Joi.string().trim().min(1).max(64);
export const page = Joi.number().integer().min(1).default(1);
export const limit = Joi.number().integer().min(1).max(100).default(20);
export const membership = Joi.object({ projectId: id.required(), role: projectRole.required() });
