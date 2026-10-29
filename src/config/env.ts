// Configuración validada con Joi al arrancar: si falta algo, el proceso no levanta.
import * as Joi from 'joi';

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  /** `memory` levanta un Mongo en memoria (solo fuera de producción). */
  MONGO_URI: string;
  /** `demo` borra la base y carga la semilla de demo al arrancar (solo fuera de producción). */
  SEED: '' | 'demo';
  /** URL pública del frontend: links de correos, PR y tarjetas. */
  PUBLIC_WEB_URL: string;
  /** URL pública de este API: la usa el storage local para firmar URLs. */
  PUBLIC_API_URL: string;
  CORS_ORIGINS: string;
  SESSION_TTL_DAYS: number;

  STORAGE_DRIVER: 'local' | 's3';
  STORAGE_DIR: string;
  STORAGE_SECRET: string;
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_FORCE_PATH_STYLE: boolean;

  MAIL_DRIVER: 'log' | 'resend';
  MAIL_FROM: string;
  RESEND_API_KEY: string;

  GITHUB_API_URL: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  PLANE_API_URL: string;
  PLANE_TOKEN: string;
  PLANE_WORKSPACE: string;

  OUTBOX_INTERVAL_MS: number;
  JOBS_ENABLED: boolean;
  /** Días que se conservan las capturas de una revisión cerrada. */
  RETENTION_DAYS: number;
}

const notInProduction = (schema: Joi.StringSchema) =>
  schema.when('NODE_ENV', { is: 'production', then: Joi.forbidden(), otherwise: Joi.optional() });

export const envSchema = Joi.object<Env>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  MONGO_URI: Joi.alternatives()
    .conditional('NODE_ENV', {
      is: 'production',
      then: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }),
      otherwise: Joi.alternatives(
        Joi.string().valid('memory'),
        Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }),
      ),
    })
    .required(),
  SEED: notInProduction(Joi.string().valid('', 'demo')).default(''),
  PUBLIC_WEB_URL: Joi.string().uri().default('http://localhost:5173'),
  PUBLIC_API_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  SESSION_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),

  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  STORAGE_DIR: Joi.string().default('.data/storage'),
  STORAGE_SECRET: Joi.string()
    .min(16)
    .when('STORAGE_DRIVER', {
      is: 'local',
      then: Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.optional().default('dev-storage-secret-change-me'),
      }),
      otherwise: Joi.optional().default(''),
    }),
  S3_BUCKET: Joi.string().when('STORAGE_DRIVER', {
    is: 's3',
    then: Joi.required(),
    otherwise: Joi.optional().allow('').default(''),
  }),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ENDPOINT: Joi.string().uri().allow('').default(''),
  S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),

  MAIL_DRIVER: Joi.string().valid('log', 'resend').default('log'),
  MAIL_FROM: Joi.string().default('QA Reviewer <no-reply@qa-reviewer.local>'),
  RESEND_API_KEY: Joi.string().when('MAIL_DRIVER', {
    is: 'resend',
    then: Joi.required(),
    otherwise: Joi.optional().allow('').default(''),
  }),

  GITHUB_API_URL: Joi.string().uri().default('https://api.github.com'),
  GITHUB_TOKEN: Joi.string().allow('').default(''),
  GITHUB_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  PLANE_API_URL: Joi.string().uri().default('https://api.plane.so'),
  PLANE_TOKEN: Joi.string().allow('').default(''),
  PLANE_WORKSPACE: Joi.string().allow('').default(''),

  OUTBOX_INTERVAL_MS: Joi.number().integer().min(500).default(5000),
  JOBS_ENABLED: Joi.boolean().default(true),
  RETENTION_DAYS: Joi.number().integer().min(1).default(90),
}).unknown(true);

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const { value, error } = envSchema.validate(source, { abortEarly: false, convert: true });
  if (error) {
    throw new Error(`Configuración inválida: ${error.details.map((d) => d.message).join('; ')}`);
  }
  return value;
}

export const ENV = Symbol('ENV');
