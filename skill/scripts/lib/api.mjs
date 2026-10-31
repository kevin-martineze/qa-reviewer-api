// Cliente HTTP del API de QA Reviewer, sin dependencias (fetch de Node 22). Las respuestas
// llegan como `{ messageKey, data }` y los errores como `{ statusCode, messageKey, message,
// details? }`; aquí se desenvuelven.

/** Error del API (o de red) con su clave estable: la skill decide qué hacer según `key`. */
export class ApiError extends Error {
  constructor(status, key, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.key = key;
    this.details = details;
  }
}

/** `https://api.x.com/`, `https://api.x.com/v1` → `https://api.x.com`. */
export function normalizeBaseUrl(url) {
  return String(url).trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * @param {{ baseUrl: string, token?: string | null, fetch?: typeof fetch, userAgent?: string }} options
 */
export function createApi({ baseUrl, token = null, fetch = globalThis.fetch, userAgent }) {
  const base = `${normalizeBaseUrl(baseUrl)}/v1`;

  async function request(method, path, { body, headers = {}, auth = true } = {}) {
    const init = {
      method,
      headers: {
        accept: 'application/json',
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    let res;
    try {
      res = await fetch(`${base}${path}`, init);
    } catch (error) {
      throw new ApiError(
        0,
        'network.unreachable',
        `No se pudo conectar con ${normalizeBaseUrl(baseUrl)}: ${error?.cause?.code ?? error?.message ?? error}`,
      );
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new ApiError(
        res.status,
        json?.messageKey ?? `http.${res.status}`,
        json?.message ?? `El API respondió ${res.status}.`,
        json?.details,
      );
    }
    return json?.data ?? null;
  }

  return {
    request,

    /* ── Login por navegador ─────────────────────────────────────── */
    startDevice: (client, repo) =>
      request('POST', '/skill/device', { body: { client, repo }, auth: false }),
    pollDevice: (deviceCode) =>
      request('POST', '/skill/device/token', { body: { deviceCode }, auth: false }),

    /* ── Skill ────────────────────────────────────────────────────── */
    project: () => request('GET', '/skill/project'),
    reviewByPr: (pr) => request('GET', `/skill/reviews?pr=${encodeURIComponent(pr)}`),
    create: (manifest, key) =>
      request('POST', '/reviews', { body: manifest, headers: { 'idempotency-key': key } }),
    addRound: (reviewId, manifest, key) =>
      request('POST', `/reviews/${encodeURIComponent(reviewId)}/rounds`, {
        body: manifest,
        headers: { 'idempotency-key': key },
      }),
    publish: (reviewId) => request('POST', `/reviews/${encodeURIComponent(reviewId)}/publish`),
    feedback: (reviewId) => request('GET', `/reviews/${encodeURIComponent(reviewId)}/feedback`),

    /** PUT a la URL firmada que dio el API (puede ser de otro host: S3, R2 o el storage local). */
    async upload(upload, bytes) {
      let res;
      try {
        res = await fetch(upload.url, {
          method: 'PUT',
          headers: upload.headers ?? {},
          body: bytes,
        });
      } catch (error) {
        throw new ApiError(
          0,
          'network.unreachable',
          `No se pudo subir la captura: ${error?.message ?? error}`,
        );
      }
      if (!res.ok) {
        let json = null;
        try {
          json = JSON.parse(await res.text());
        } catch {
          json = null;
        }
        throw new ApiError(
          res.status,
          json?.messageKey ?? 'storage.upload_failed',
          json?.message ?? `El storage respondió ${res.status} al subir «${upload.screenKey}».`,
        );
      }
    },
  };
}

/** ¿Vale la pena reintentar? Red caída o error del servidor; nunca un 4xx. */
export function isRetryable(error) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

/** Reintenta `fn` hasta `attempts` veces con espera creciente (0,5 s, 1 s, 2 s…). */
export async function withRetry(fn, { attempts = 3, sleep = defaultSleep, baseMs = 500 } = {}) {
  for (let i = 1; ; i += 1) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts || !isRetryable(error)) throw error;
      await sleep(baseMs * 2 ** (i - 1));
    }
  }
}

export const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
