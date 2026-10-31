import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { configDir, credentialStore } from './credentials.mjs';

test('configDir respeta XDG_CONFIG_HOME', () => {
  assert.equal(configDir({ XDG_CONFIG_HOME: '/x' }), join('/x', 'qa-reviewer'));
});

test('guarda por URL normalizada, con permisos 700 y 600', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'qa-cred-')), 'qa-reviewer');
  const store = credentialStore(dir);
  await store.save('https://api.x.com/v1/', { token: 'qa_pat_a' });
  await store.save('http://localhost:3000', { token: 'qa_pat_b' });

  assert.deepEqual(await store.get('https://api.x.com'), { token: 'qa_pat_a' });
  assert.deepEqual(await store.get('http://localhost:3000/'), { token: 'qa_pat_b' });
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(store.path)).mode & 0o777, 0o600);

  await store.remove('https://api.x.com');
  assert.equal(await store.get('https://api.x.com'), null);
  const raw = JSON.parse(await readFile(store.path, 'utf8'));
  assert.deepEqual(Object.keys(raw), ['http://localhost:3000']);
  await store.clear();
});

test('el login pendiente va aparte y se borra solo', async () => {
  const store = credentialStore(join(await mkdtemp(join(tmpdir(), 'qa-cred-')), 'qa-reviewer'));
  assert.equal(await store.getPending('http://a'), null);
  await store.savePending('http://a', { deviceCode: 'd' });
  assert.deepEqual(await store.getPending('http://a'), { deviceCode: 'd' });
  assert.equal(await store.get('http://a'), null);
  await store.clearPending('http://a');
  assert.equal(await store.getPending('http://a'), null);
  await store.clear();
});
