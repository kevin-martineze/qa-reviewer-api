import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from './api.mjs';
import { canonicalJson, idempotencyKey, KEY_WINDOW_MS, submit } from './submit.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'qa-submit-'));
  await writeFile(join(dir, 'a-after.png'), 'AAA');
  await writeFile(join(dir, 'b-after.png'), 'BBBB');
  const capture = (key, body) => ({
    key,
    contentType: 'image/png',
    bytes: body.length,
    sha256: sha(body),
  });
  const manifest = {
    version: 1,
    project: 'lideris',
    pr: { number: 868 },
    screens: [
      { key: 'a', captures: { after: capture('a-after.png', 'AAA') } },
      { key: 'b', captures: { after: capture('b-after.png', 'BBBB') } },
    ],
  };
  return { dir, manifest };
}

/** API falsa que anota cada llamada; `create` puede fallar con `createError`. */
function fakeApi({ createError, uploadFailures = 0 } = {}) {
  const log = [];
  let failures = uploadFailures;
  const draft = (id, round) => ({
    id,
    round,
    status: 'draft',
    changed: ['a'],
    url: `http://web/reviews/${id}`,
    uploads: [
      { screenKey: 'a', kind: 'after', url: 'http://s/a', headers: {} },
      { screenKey: 'b', kind: 'after', url: 'http://s/b', headers: {} },
    ],
  });
  return {
    log,
    create: async (m, key) => {
      log.push(['create', key]);
      if (createError) throw createError;
      return draft('QR-0001', 1);
    },
    addRound: async (id, m, key) => {
      log.push(['round', id, key]);
      return draft(id, 3);
    },
    upload: async (upload, bytes) => {
      if (failures-- > 0) throw new ApiError(503, 'http.503', 'caído');
      log.push(['upload', upload.screenKey, bytes.toString()]);
    },
    publish: async (id) => {
      log.push(['publish', id]);
      return {
        id,
        round: id === 'QR-0001' ? 1 : 3,
        status: 'open',
        url: `http://web/reviews/${id}`,
        changed: ['a'],
      };
    },
  };
}

const sleep = async () => {};

test('canonicalJson no depende del orden de las claves', () => {
  assert.equal(
    canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }),
    canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }),
  );
});

test('la clave es estable dentro de la ventana y cambia fuera', () => {
  const m = { a: 1 };
  const t = 1_000 * KEY_WINDOW_MS;
  assert.equal(idempotencyKey('create', m, t), idempotencyKey('create', m, t + KEY_WINDOW_MS - 1));
  assert.notEqual(idempotencyKey('create', m, t), idempotencyKey('create', m, t + KEY_WINDOW_MS));
  assert.notEqual(idempotencyKey('create', m, t), idempotencyKey('create', { a: 2 }, t));
  assert.match(idempotencyKey('create', m, t), /^design-review:create:1000:[0-9a-f]{40}$/);
});

test('crea, sube cada captura y publica', async () => {
  const { dir, manifest } = await fixture();
  const api = fakeApi({ uploadFailures: 1 });
  const result = await submit({ api, manifest, capturesDir: dir, sleep, now: () => 0 });
  assert.deepEqual(result, {
    id: 'QR-0001',
    round: 1,
    status: 'open',
    url: 'http://web/reviews/QR-0001',
    changed: ['a'],
    uploaded: 2,
    created: true,
  });
  assert.deepEqual(
    api.log.map((l) => l.slice(0, 3)),
    [
      ['create', idempotencyKey('create', manifest, 0)],
      ['upload', 'a', 'AAA'],
      ['upload', 'b', 'BBBB'],
      ['publish', 'QR-0001'],
    ],
  );
});

test('si el PR ya tiene revisión, sube una ronda nueva', async () => {
  const { dir, manifest } = await fixture();
  const exists = new ApiError(409, 'reviews.exists', 'Ya hay', { reviewId: 'QR-0012' });
  const api = fakeApi({ createError: exists });
  const result = await submit({ api, manifest, capturesDir: dir, sleep, now: () => 0 });
  assert.equal(result.created, false);
  assert.equal(result.round, 3);
  assert.deepEqual(api.log[1], ['round', 'QR-0012', idempotencyKey('round:QR-0012', manifest, 0)]);
});

test('otros errores del create no se tapan', async () => {
  const { dir, manifest } = await fixture();
  const api = fakeApi({ createError: new ApiError(403, 'manifest.project_mismatch', 'Otro') });
  await assert.rejects(submit({ api, manifest, capturesDir: dir, sleep }), {
    key: 'manifest.project_mismatch',
  });
  assert.equal(api.log.length, 1);
});

test('una captura que no coincide frena antes de llamar al API', async () => {
  const { dir, manifest } = await fixture();
  await writeFile(join(dir, 'b-after.png'), 'BBBX');
  const api = fakeApi();
  await assert.rejects(submit({ api, manifest, capturesDir: dir, sleep }), (error) => {
    assert.equal(error.key, 'captures.mismatch');
    assert.equal(error.details.problems.length, 1);
    assert.match(error.details.problems[0], /SHA-256/);
    return true;
  });
  assert.deepEqual(api.log, []);
});
