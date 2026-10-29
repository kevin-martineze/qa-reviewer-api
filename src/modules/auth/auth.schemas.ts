import * as Joi from 'joi';

import { avatar, email, password, personName } from '../../shared/validation';

export const loginSchema = Joi.object({
  email: email.required(),
  password: Joi.string().min(1).max(200).required(),
});

export const recoveryRequestSchema = Joi.object({ email: email.required() });
export const resetPasswordSchema = Joi.object({ password: password.required() });

export const acceptInviteSchema = Joi.object({
  name: personName.required(),
  password: password.required(),
  avatar: avatar.default(null),
});

export const profileSchema = Joi.object({
  name: personName.required(),
  avatar: avatar.default(null),
});

export const changePasswordSchema = Joi.object({
  current: Joi.string().min(1).max(200).required(),
  next: password.required(),
});
