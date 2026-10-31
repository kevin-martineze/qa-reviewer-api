// Publicar una ronda: valida las capturas en disco, crea la revisión (o la ronda nueva si el PR
// ya tiene una), sube cada captura a su URL firmada y publica.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ApiError, withRetry } from './api.mjs';
import { fileInfo } from './hash.mjs';

/** JSON con claves ordenadas: el mismo manifiesto da siempre el mismo texto. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Ventana de la clave: menor que los 15 min de las URLs firmadas de subida. */
export const KEY_WINDOW_MS = 10 * 60 * 1000;

/**
 * `Idempotency-Key` por intento lógico: misma acción, mismo manifiesto y misma ventana de 10
 * min, misma clave. Un reintento cortado recibe la misma respuesta; un submit horas después
 * pide URLs de subida nuevas en vez de recibir las vencidas.
 */
export function idempotencyKey(action, manifest, now = Date.now()) {
  const hash = createHash('sha256').update(canonicalJson(manifest)).digest('hex');
  return `design-review:${action}:${Math.floor(now / KEY_WINDOW_MS)}:${hash.slice(0, 40)}`;
}

/** Las capturas del manifiesto: pantalla, tipo y archivo. */
export function capturesOf(manifest) {
  return (manifest.screens ?? []).flatMap((screen) =>
    ['after', 'before']
      .filter((kind) => screen.captures?.[kind])
      .map((kind) => ({ screenKey: screen.key, kind, capture: screen.captures[kind] })),
  );
}

/** Que cada captura exista en `dir` con los bytes y el SHA-256 declarados. Devuelve los problemas. */
export async function verifyCaptures(manifest, dir) {
  const problems = [];
  for (const { screenKey, kind, capture } of capturesOf(manifest)) {
    const path = join(dir, capture.key);
    let info;
    try {
      info = await fileInfo(path);
    } catch {
      problems.push(`«${screenKey}» (${kind}): falta ${path}`);
      continue;
    }
    if (info.bytes !== capture.bytes) {
      problems.push(
        `«${screenKey}» (${kind}): ${capture.key} pesa ${info.bytes} bytes, no ${capture.bytes}`,
      );
    } else if (info.sha256 !== capture.sha256) {
      problems.push(`«${screenKey}» (${kind}): el SHA-256 de ${capture.key} no coincide`);
    }
  }
  return problems;
}

/**
 * @returns {Promise<{ id: string, round: number, status: string, url: string, changed: string[], uploaded: number, created: boolean }>}
 */
export async function submit({
  api,
  manifest,
  capturesDir,
  say = () => {},
  read = readFile,
  sleep,
  now = Date.now,
}) {
  const at = now();
  const problems = await verifyCaptures(manifest, capturesDir);
  if (problems.length) {
    throw new ApiError(
      422,
      'captures.mismatch',
      `Las capturas no coinciden con el manifiesto:\n- ${problems.join('\n- ')}`,
      { problems },
    );
  }

  let draft;
  let created = true;
  try {
    draft = await withRetry(() => api.create(manifest, idempotencyKey('create', manifest, at)), {
      sleep,
    });
  } catch (error) {
    const reviewId =
      error instanceof ApiError && error.key === 'reviews.exists' ? error.details?.reviewId : null;
    if (!reviewId) throw error;
    created = false;
    say(`El PR ya tiene la revisión ${reviewId}: subo una ronda nueva.`);
    draft = await withRetry(
      () => api.addRound(reviewId, manifest, idempotencyKey(`round:${reviewId}`, manifest, at)),
      { sleep },
    );
  }

  const files = new Map(
    capturesOf(manifest).map((c) => [`${c.screenKey}:${c.kind}`, c.capture.key]),
  );
  for (const upload of draft.uploads ?? []) {
    const key = files.get(`${upload.screenKey}:${upload.kind}`);
    if (!key) {
      throw new ApiError(
        500,
        'captures.unexpected',
        `El API pidió «${upload.screenKey}» (${upload.kind}), que no está en el manifiesto.`,
      );
    }
    const bytes = await read(join(capturesDir, key));
    await withRetry(() => api.upload(upload, bytes), { sleep });
  }
  say(`Subidas ${draft.uploads?.length ?? 0} capturas de la ronda ${draft.round}.`);

  const published = await withRetry(() => api.publish(draft.id), { sleep });
  return {
    id: published.id,
    round: published.round,
    status: published.status,
    url: published.url,
    changed: published.changed ?? draft.changed ?? [],
    uploaded: draft.uploads?.length ?? 0,
    created,
  };
}
