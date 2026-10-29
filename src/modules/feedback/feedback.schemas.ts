import * as Joi from 'joi';

const body = Joi.string().trim().min(1).max(4000);
const fraction = Joi.number().min(0).max(1).required();

export const verdictSchema = Joi.object({
  verdict: Joi.string().valid('pending', 'approved', 'changes_requested').required(),
});

/** Mensaje opcional del envío; vacío cuenta como sin mensaje. */
export const submitSchema = Joi.object({
  body: Joi.string().trim().max(4000).allow(null, '').empty('').default(null),
});

export const newCommentSchema = Joi.object({
  body: body.required(),
  anchor: Joi.object({ x: fraction, y: fraction }).allow(null).default(null),
  el: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    file: Joi.string().trim().min(1).max(300).required(),
    line: Joi.number().integer().min(0).required(),
    selector: Joi.string().trim().allow('').max(300).required(),
  })
    .allow(null)
    .default(null),
});

export const replySchema = Joi.object({ body: body.required() });

export const resolveSchema = Joi.object({ resolved: Joi.boolean().required() });

export const followUpSchema = Joi.object({
  followUp: Joi.string().valid('resolved', 'still').required(),
});
