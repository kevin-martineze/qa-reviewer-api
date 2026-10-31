// Login por navegador (device flow, RFC 8628): pide un código, abre la web para aprobarlo y
// sondea hasta recibir el token. Si se corta, el siguiente `login` retoma el mismo código.
import { ApiError, defaultSleep } from './api.mjs';

/**
 * @param {object} deps
 * @param {ReturnType<import('./api.mjs').createApi>} deps.api  cliente sin token
 * @param {ReturnType<import('./credentials.mjs').credentialStore>} deps.store
 * @param {string} deps.apiUrl
 * @param {{ name: string, version: string, hostname: string }} deps.client
 * @param {string | null} deps.repo
 * @param {(url: string) => void} deps.open        abre el navegador (puede fallar en silencio)
 * @param {(line: string) => void} deps.say        mensajes para la persona (stderr)
 * @param {number} [deps.waitSeconds]              cuánto sondear antes de rendirse por ahora
 */
export async function login({
  api,
  store,
  apiUrl,
  client,
  repo,
  open,
  say,
  waitSeconds = 540,
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  let pending = await store.getPending(apiUrl);
  if (pending && Date.parse(pending.expiresAt) <= now()) {
    await store.clearPending(apiUrl);
    pending = null;
  }
  if (!pending) {
    const auth = await api.startDevice(client, repo);
    pending = {
      deviceCode: auth.deviceCode,
      userCode: auth.userCode,
      verificationUriComplete: auth.verificationUriComplete,
      interval: auth.interval,
      expiresAt: new Date(now() + auth.expiresIn * 1000).toISOString(),
    };
    await store.savePending(apiUrl, pending);
    open(pending.verificationUriComplete);
  }
  say(`Abre ${pending.verificationUriComplete} y aprueba el código ${pending.userCode}.`);

  let interval = pending.interval;
  const deadline = Math.min(now() + waitSeconds * 1000, Date.parse(pending.expiresAt));
  while (now() < deadline) {
    await sleep(interval * 1000);
    try {
      const grant = await api.pollDevice(pending.deviceCode);
      const credentials = {
        token: grant.secret,
        tokenId: grant.token.id,
        project: grant.project,
        user: grant.user,
        savedAt: new Date(now()).toISOString(),
      };
      await store.save(apiUrl, credentials);
      await store.clearPending(apiUrl);
      return credentials;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.key === 'device.pending') continue;
      if (error.key === 'device.slow_down') {
        interval += 5;
        continue;
      }
      if (error.status === 0 || error.status >= 500) continue;
      // denied, expired, used o not_found: este código ya no sirve.
      await store.clearPending(apiUrl);
      throw error;
    }
  }
  if (Date.parse(pending.expiresAt) <= now()) {
    await store.clearPending(apiUrl);
    throw new ApiError(
      410,
      'device.expired',
      'El código venció sin aprobarse. Vuelve a correr login.',
    );
  }
  throw new ApiError(
    408,
    'device.waiting',
    `Todavía sin aprobar. Corre login otra vez para seguir esperando el mismo código (${pending.userCode}).`,
  );
}
