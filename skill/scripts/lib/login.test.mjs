import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from './api.mjs';
import { credentialStore } from './credentials.mjs';
import { login } from './login.mjs';

const URL = 'http://localhost:3000';
const AUTH = {
  deviceCode: 'dev-code',
  userCode: 'ABCD-EFGH',
  verificationUri: 'http://web/device',
  verificationUriComplete: 'http://web/device?code=ABCD-EFGH',
  expiresIn: 600,
  interval: 5,
};
const GRANT = {
  secret: 'qa_pat_secreto',
  token: { id: 'tok1' },
  project: { id: 'lideris', name: 'Lideris' },
  user: { id: 'u1', name: 'Kevin' },
};

/** Reloj falso: `sleep` lo adelanta. `polls` son las respuestas de cada sondeo. */
async function setup(polls) {
  let clock = Date.parse('2026-10-31T12:00:00Z');
  const sleeps = [];
  const opened = [];
  const calls = { start: 0, poll: 0 };
  const api = {
    startDevice: async () => {
      calls.start += 1;
      return AUTH;
    },
    pollDevice: async () => {
      const next = polls[calls.poll];
      calls.poll += 1;
      if (next instanceof Error) throw next;
      return next ?? Promise.reject(new ApiError(400, 'device.pending', 'Pendiente'));
    },
  };
  const store = credentialStore(join(await mkdtemp(join(tmpdir(), 'qa-login-')), 'qa-reviewer'));
  const deps = {
    api,
    store,
    apiUrl: URL,
    client: { name: 'design-review', version: '0.1.0', hostname: 'mac' },
    repo: 'o/r',
    open: (url) => opened.push(url),
    say: () => {},
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return { deps, store, sleeps, opened, calls, advance: (ms) => (clock += ms) };
}

const pending = () => new ApiError(400, 'device.pending', 'Pendiente');

test('abre el navegador, sondea y guarda el token', async () => {
  const s = await setup([pending(), new ApiError(429, 'device.slow_down', 'Más lento'), GRANT]);
  const creds = await login(s.deps);
  assert.equal(creds.token, 'qa_pat_secreto');
  assert.deepEqual(s.opened, [AUTH.verificationUriComplete]);
  assert.deepEqual(s.sleeps, [5000, 5000, 10000]);
  assert.equal((await s.store.get(URL)).tokenId, 'tok1');
  assert.equal(await s.store.getPending(URL), null);
});

test('si se acaba la espera, el siguiente login retoma el mismo código', async () => {
  const s = await setup([pending(), pending(), GRANT]);
  await assert.rejects(login({ ...s.deps, waitSeconds: 10 }), {
    key: 'device.waiting',
    status: 408,
  });
  assert.equal((await s.store.getPending(URL)).deviceCode, 'dev-code');

  const creds = await login(s.deps);
  assert.equal(creds.token, 'qa_pat_secreto');
  assert.equal(s.calls.start, 1);
  assert.equal(s.opened.length, 1);
});

test('un código vencido se descarta y se pide otro', async () => {
  const s = await setup([pending(), GRANT]);
  await assert.rejects(login({ ...s.deps, waitSeconds: 5 }), { key: 'device.waiting' });
  s.advance(601_000);
  await login(s.deps);
  assert.equal(s.calls.start, 2);
});

test('rechazado: borra el pendiente y falla', async () => {
  const s = await setup([new ApiError(403, 'device.denied', 'Rechazado')]);
  await assert.rejects(login(s.deps), { key: 'device.denied' });
  assert.equal(await s.store.getPending(URL), null);
  assert.equal(await s.store.get(URL), null);
});

test('la red caída no corta el sondeo', async () => {
  const s = await setup([
    new ApiError(0, 'network.unreachable', 'x'),
    new ApiError(503, 'http.503', 'x'),
    GRANT,
  ]);
  assert.equal((await login(s.deps)).token, 'qa_pat_secreto');
});

test('sin aprobar hasta que vence: device.expired', async () => {
  const s = await setup([]);
  await assert.rejects(login({ ...s.deps, waitSeconds: 900 }), { key: 'device.expired' });
  assert.equal(await s.store.getPending(URL), null);
});
