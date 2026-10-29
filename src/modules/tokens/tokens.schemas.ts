import * as Joi from 'joi';

import { id } from '../../shared/validation';

export const newTokenSchema = Joi.object({
  projectId: id.required(),
  label: Joi.string().trim().min(1).max(80).required(),
});
