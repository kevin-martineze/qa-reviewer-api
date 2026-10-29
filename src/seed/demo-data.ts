import type {
  ActivityEvent,
  AuditEvent,
  Comment,
  Membership,
  Notification,
  Organization,
  OrgRole,
  Project,
  ProjectMember,
  Review,
  User,
} from '../shared/contract';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as Joi from 'joi';

import { shiftDates } from './shift-dates';

/**
 * Forma de `seed/demo/data.json`. La exporta la web desde su mock
 * (`pnpm seed:export` en qa-reviewer), en la forma del contrato más los
 * tokens en claro que el mock usa para probar invitaciones y recuperación.
 */
export interface DemoInvite {
  id: string;
  token: string;
  email: string;
  inviter: string;
  role: OrgRole;
  projects: Membership[];
  createdAt: string;
  expiresAt: string;
  used: boolean;
  revoked: boolean;
}

export interface DemoRecovery {
  token: string;
  userId: string;
  expiresAt: string;
  used: boolean;
}

export interface DemoToken {
  id: string;
  owner: string;
  label: string;
  prefix: string;
  project: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DemoNotification extends Notification {
  user: string;
}

export interface DemoData {
  version: 1;
  exportedAt: string;
  password: string;
  org: Organization;
  users: User[];
  projects: Project[];
  memberships: ProjectMember[];
  invites: DemoInvite[];
  recoveries: DemoRecovery[];
  tokens: DemoToken[];
  reviews: Review[];
  comments: Comment[];
  notifications: DemoNotification[];
  activity: ActivityEvent[];
  audit: AuditEvent[];
}

const item = (keys: string[]) =>
  Joi.object(Object.fromEntries(keys.map((key) => [key, Joi.required()]))).unknown(true);

/** Revisa lo que el loader usa; el detalle ya lo garantiza el mock que lo exporta. */
const schema = Joi.object({
  version: Joi.number().valid(1).required(),
  exportedAt: Joi.string().isoDate().required(),
  password: Joi.string().min(8).required(),
  org: item(['id', 'name']),
  users: Joi.array()
    .items(item(['id', 'name', 'email', 'orgRole', 'status']))
    .required(),
  projects: Joi.array()
    .items(item(['id', 'name']))
    .required(),
  memberships: Joi.array()
    .items(item(['userId', 'projectId', 'role']))
    .required(),
  invites: Joi.array()
    .items(item(['id', 'token', 'email', 'inviter', 'role']))
    .required(),
  recoveries: Joi.array()
    .items(item(['token', 'userId', 'expiresAt']))
    .required(),
  tokens: Joi.array()
    .items(item(['id', 'owner', 'prefix', 'project']))
    .required(),
  reviews: Joi.array()
    .items(item(['id', 'project', 'screens', 'rounds', 'pr']))
    .required(),
  comments: Joi.array()
    .items(item(['id', 'review', 'screen', 'author']))
    .required(),
  notifications: Joi.array()
    .items(item(['id', 'user', 'type', 'text']))
    .required(),
  activity: Joi.array()
    .items(item(['id', 'type', 'review']))
    .required(),
  audit: Joi.array()
    .items(item(['id', 'type', 'actor']))
    .required(),
}).unknown(true);

export const DEMO_DIR = join(process.cwd(), 'seed', 'demo');

/** Lee la demo y corre sus fechas para que queden relativas a `now`. */
export async function loadDemoData(now: Date, dir = DEMO_DIR): Promise<DemoData> {
  const raw: unknown = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'));
  const exportedAt =
    typeof raw === 'object' && raw !== null && 'exportedAt' in raw ? raw.exportedAt : null;
  if (typeof exportedAt !== 'string') throw new Error('seed/demo/data.json no trae exportedAt.');

  const shifted = shiftDates(raw, now.getTime() - Date.parse(exportedAt));
  const { error, value } = schema.validate(shifted);
  if (error) throw new Error(`seed/demo/data.json no es válido: ${error.message}`);
  const data: DemoData = value;
  return data;
}
