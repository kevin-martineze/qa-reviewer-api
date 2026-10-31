import * as Joi from 'joi';

import { id } from '../../shared/validation';

const text = (max: number) => Joi.string().trim().min(1).max(max);

export const startDeviceSchema = Joi.object({
  client: Joi.object({
    name: text(60).required(),
    version: text(30).required(),
    hostname: text(100).required(),
  }).required(),
  /** `owner/repo` del remoto de git; solo sirve para sugerir el proyecto. */
  repo: Joi.string()
    .trim()
    .max(200)
    .pattern(/^[\w.-]+\/[\w.-]+$/)
    .allow(null, '')
    .empty('')
    .default(null),
});

export const pollDeviceSchema = Joi.object({
  deviceCode: Joi.string().trim().min(1).max(200).required(),
});

/** Sin `label`, el token se llama «Claude Code · <hostname>». */
export const approveDeviceSchema = Joi.object({
  projectId: id.required(),
  label: text(80),
});
