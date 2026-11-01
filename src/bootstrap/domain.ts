// Reglas puras del primer arranque: validar los datos y derivar el id de la organización.
import * as Joi from 'joi';

/** Horas que vale el enlace para que el owner defina su contraseña. */
export const BOOTSTRAP_LINK_HOURS = 24;

export interface BootstrapInput {
  /** Nombre visible de la organización. */
  org: string;
  /** Id (slug) de la organización; por defecto, el del nombre. */
  orgId: string;
  owner: string;
  name: string;
}

/** `Estudio Norte S.A.S.` → `estudio-norte-s-a-s`. Vacío si el nombre no tiene letras ni números. */
export function orgSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

const schema = Joi.object<BootstrapInput>({
  org: Joi.string().trim().min(2).max(100).required(),
  orgId: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(40)
    .required(),
  owner: Joi.string().trim().lowercase().email().required(),
  name: Joi.string().trim().min(2).max(100).required(),
});

/** Valida los argumentos del CLI. Devuelve los datos normalizados o la lista de errores. */
export function parseBootstrapInput(raw: {
  org?: string;
  id?: string;
  owner?: string;
  name?: string;
}): { value: BootstrapInput; errors: null } | { value: null; errors: string[] } {
  const { value, error } = schema.validate(
    { org: raw.org, orgId: raw.id ?? orgSlug(raw.org ?? ''), owner: raw.owner, name: raw.name },
    { abortEarly: false, convert: true },
  );
  if (error) return { value: null, errors: error.details.map((d) => d.message) };
  return { value, errors: null };
}
