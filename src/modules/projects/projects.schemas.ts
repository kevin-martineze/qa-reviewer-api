import * as Joi from 'joi';

import { id, projectName, projectRole, projectSlug } from '../../shared/validation';

const repo = Joi.string().trim().allow('').max(200);
const planeKey = Joi.string().trim().allow('').max(20);

const integrations = Joi.object({
  github: Joi.object({
    connected: Joi.boolean().required(),
    repo: repo.required(),
    checkName: Joi.string().trim().min(1).max(100).required(),
    commentOnPr: Joi.boolean().required(),
  }).required(),
  plane: Joi.object({
    connected: Joi.boolean().required(),
    projectKey: planeKey.required(),
    commentOnCard: Joi.boolean().required(),
  }).required(),
});

export const newProjectSchema = Joi.object({
  id: projectSlug.required(),
  name: projectName.required(),
  repo: repo.default(''),
  planeKey: planeKey.default(''),
});

/** `ProjectPatch` de la web: parcial, al menos un campo. */
export const projectPatchSchema = Joi.object({
  name: projectName,
  slaDays: Joi.number().integer().min(1).max(15),
  strategy: Joi.string().valid('manual', 'round_robin', 'by_module'),
  moduleRules: Joi.array()
    .items(
      Joi.object({
        pattern: Joi.string().trim().min(1).max(200).required(),
        userId: id.required(),
      }),
    )
    .max(100),
  integrations,
  maskSelectors: Joi.array().items(Joi.string().trim().min(1).max(200)).max(50),
  designRules: Joi.array().items(Joi.string().trim().min(1).max(500)).max(50),
}).min(1);

export const newMemberSchema = Joi.object({
  userId: id.required(),
  role: projectRole.required(),
});

export const memberRoleSchema = Joi.object({ role: projectRole.required() });
