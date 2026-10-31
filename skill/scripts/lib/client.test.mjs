// El CLI completo (`client.mjs`) contra un API falso: argumentos, salida y códigos de salida.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { credentialStore } from './credentials.mjs';

const CLIENT = fileURLToPath(new URL('../client.mjs', import.meta.url));
const PROJECT = { id: 'lideris', name: 'Lideris', minSkillVersion: '0.1.0' };

let server;
let base;
let minSkillVersion = '0.1.0';
const valid = new Set(['qa_pat_ok']);
const auth = [];

before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const token = req.headers.authorization?.replace('Bearer ', '');
    const send = (status, json) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    const route = `${req.method} ${req.url}`;
    if (route === 'POST /v1/skill/device') {
      return send(201, {
        data: {
          deviceCode: 'dc',
          userCode: 'ABCD-EFGH',
          verificationUriComplete: 'http://web/device?code=ABCD-EFGH',
          expiresIn: 600,
          interval: 0,
        },
      });
    }
    if (route === 'POST /v1/skill/device/token') {
      valid.add('qa_pat_new');
      return send(200, {
        data: {
          secret: 'qa_pat_new',
          token: { id: 't2' },
          project: PROJECT,
          user: { id: 'u1', name: 'Kevin' },
        },
      });
    }
    auth.push(token);
    if (!valid.has(token))
      return send(401, { messageKey: 'auth.invalid_token', message: 'Token inválido.' });
    if (route === 'GET /v1/skill/project')
      return send(200, { data: { ...PROJECT, minSkillVersion } });
    if (route === 'GET /v1/skill/reviews?pr=868') return send(200, { data: { id: 'QR-0012' } });
    if (route === 'GET /v1/skill/reviews?pr=999') {
      return send(404, { messageKey: 'reviews.not_found', message: 'No existe.' });
    }
    if (route === 'GET /v1/reviews/QR-0012/feedback') {
      return send(200, {
        data: {
          review: { id: 'QR-0012', round: 2, status: 'changes_requested' },
          text: 'Pantalla c: ajustar.',
        },
      });
    }
    return send(404, { messageKey: 'http.not_found', message: route });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/** Corre el CLI y devuelve `{ code, stdout, stderr }` sin lanzar. */
async function cli(args, env = {}) {
  const config = env.XDG_CONFIG_HOME ?? (await mkdtemp(join(tmpdir(), 'qa-cli-')));
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLIENT, ...args],
      {
        env: {
          PATH: process.env.PATH,
          QA_REVIEWER_API_URL: `${base}/v1`,
          QA_REVIEWER_NO_BROWSER: '1',
          ...env,
          XDG_CONFIG_HOME: config,
        },
      },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

test('project con QA_REVIEWER_TOKEN imprime el JSON', async () => {
  const res = await cli(['project'], { QA_REVIEWER_TOKEN: 'qa_pat_ok' });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).id, 'lideris');
});

test('skill más vieja que minSkillVersion: código 3 y cómo actualizar', async () => {
  minSkillVersion = '9.0.0';
  const res = await cli(['project'], { QA_REVIEWER_TOKEN: 'qa_pat_ok' });
  minSkillVersion = '0.1.0';
  assert.equal(res.code, 3);
  assert.match(res.stderr, /skill\.outdated: .*\/plugin update qa-reviewer/);
});

test('status por PR imprime el feedback en texto', async () => {
  const res = await cli(['status', '--pr', '868'], { QA_REVIEWER_TOKEN: 'qa_pat_ok' });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, 'QR-0012 · ronda 2 · changes_requested\n\nPantalla c: ajustar.\n');
});

test('status de un PR sin revisión: reviews.not_found y código 1', async () => {
  const res = await cli(['status', '--pr', '999'], { QA_REVIEWER_TOKEN: 'qa_pat_ok' });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /reviews\.not_found: El PR #999/);
});

test('uso incorrecto: código 2', async () => {
  assert.equal((await cli([])).code, 2);
  assert.equal((await cli(['volar'])).code, 2);
  assert.equal((await cli(['submit', 'm.json'], { QA_REVIEWER_TOKEN: 'qa_pat_ok' })).code, 2);
});

test('submit con un manifiesto de otro proyecto no sube nada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-cli-m-'));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ project: 'auralis', screens: [] }));
  const res = await cli(['submit', join(dir, 'manifest.json'), '--captures', dir], {
    QA_REVIEWER_TOKEN: 'qa_pat_ok',
  });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /manifest\.project_mismatch/);
});

test('un token guardado revocado dispara el login y reintenta', async () => {
  const config = await mkdtemp(join(tmpdir(), 'qa-cli-'));
  const store = credentialStore(join(config, 'qa-reviewer'));
  await store.save(base, { token: 'qa_pat_revocado', project: PROJECT, user: { name: 'Kevin' } });

  const res = await cli(['project'], { XDG_CONFIG_HOME: config });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stderr, /ya no sirve/);
  assert.equal(JSON.parse(res.stdout).id, 'lideris');
  assert.equal((await store.get(base)).token, 'qa_pat_new');

  const who = await cli(['whoami'], { XDG_CONFIG_HOME: config });
  assert.equal(JSON.parse(who.stdout).user.name, 'Kevin');
  await cli(['logout'], { XDG_CONFIG_HOME: config });
  assert.equal(await store.get(base), null);
  assert.equal((await cli(['whoami'], { XDG_CONFIG_HOME: config })).code, 1);
});
