import * as Joi from 'joi';

import { id } from '../../shared/validation';

/** `from` y `to` son instantes ISO 8601; filtran por la fecha en que la revisión quedó `open`. */
export const reportsQuerySchema = Joi.object({
  project: id.allow('').empty(''),
  from: Joi.date().iso(),
  to: Joi.date().iso().min(Joi.ref('from')),
});
