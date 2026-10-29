// Forma del manifiesto v1. Los límites del proyecto se revisan después (domain/manifest.ts).
import * as Joi from 'joi';

import { id } from '../../shared/validation';

const text = (max: number) => Joi.string().trim().min(1).max(max);
const optionalText = (max: number) => Joi.string().trim().allow('').max(max);
const fraction = Joi.number().min(0).max(1).required();
const box = Joi.object({ x: fraction, y: fraction, w: fraction, h: fraction });

const capture = Joi.object({
  key: text(200).required(),
  contentType: text(50).required(),
  bytes: Joi.number().integer().min(1).required(),
  sha256: Joi.string().hex().length(64).required(),
});

const element = Joi.object({
  name: text(100).required(),
  file: text(300).required(),
  line: Joi.number().integer().min(0).required(),
  selector: optionalText(300).required(),
  box: box.required(),
});

/** La clave va en la ruta del storage: solo letras, números, guiones y guion bajo. */
const screenKey = Joi.string().pattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, 'clave de pantalla');

const screen = Joi.object({
  key: screenKey.required(),
  title: text(120).required(),
  lead: optionalText(500).default(''),
  route: text(300).required(),
  viewport: Joi.object({
    width: Joi.number().integer().min(1).max(10_000).required(),
    height: Joi.number().integer().min(1).max(20_000).required(),
  }).required(),
  captures: Joi.object({
    after: capture.required(),
    before: capture.allow(null).default(null),
  }).required(),
  elements: Joi.array().items(element).max(100).default([]),
  diff: Joi.array().items(box).max(100).default([]),
  note: optionalText(1000).allow(null).default(null),
  changes: Joi.array().items(text(500)).max(30).default([]),
  questions: Joi.array().items(text(500)).max(30).default([]),
});

export const manifestSchema = Joi.object({
  manifestVersion: Joi.number().integer().min(1).required(),
  project: id.required(),
  card: Joi.object({ key: text(40).required(), title: text(200).required() }).required(),
  pr: Joi.object({
    number: Joi.number().integer().min(1).required(),
    url: Joi.string()
      .uri({ scheme: ['https', 'http'] })
      .max(500)
      .required(),
    title: text(300).required(),
    base: text(200).required(),
    head: text(200).required(),
    author: text(100).required(),
    commit: Joi.string().hex().min(7).max(64).required(),
  }).required(),
  title: text(200).required(),
  context: optionalText(500).default(''),
  module: optionalText(80).default(''),
  note: optionalText(1000).allow(null).default(null),
  summary: Joi.object({
    steps: Joi.array()
      .items(Joi.object({ title: text(120).required(), body: text(1000).required() }))
      .max(20)
      .default([]),
    rules: Joi.array().items(text(500)).max(30).default([]),
  }).default({ steps: [], rules: [] }),
  screens: Joi.array().items(screen).min(1).max(100).required(),
  notCaptured: Joi.array()
    .items(text(500), Joi.object({ title: text(120).required(), body: text(500).required() }))
    .max(30)
    .default([]),
  privacy: Joi.object({
    masked: Joi.boolean().required(),
    dataset: text(80).required(),
  }).required(),
  generator: Joi.object({ name: text(80).required(), version: text(40).required() })
    .allow(null)
    .default(null),
});

/** `Idempotency-Key`: lo genera la skill por intento lógico (un UUID, típicamente). */
export const idempotencyKeySchema = Joi.string()
  .trim()
  .min(8)
  .max(200)
  .pattern(/^[\x21-\x7e]+$/, 'ASCII visible');
