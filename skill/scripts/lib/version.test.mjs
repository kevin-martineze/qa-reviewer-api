import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { repoFromRemote } from './git.mjs';
import { compareVersions, skillVersion } from './version.mjs';

test('compareVersions compara X.Y.Z por número', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('dev', '0.0.1'), -1);
});

test('skillVersion lee plugin.json y si no, package.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qa-ver-'));
  await writeFile(join(root, 'package.json'), '{"version":"0.0.9"}');
  assert.equal(await skillVersion(root), '0.0.9');
  await mkdir(join(root, '.claude-plugin'));
  await writeFile(join(root, '.claude-plugin', 'plugin.json'), '{"version":"0.2.0"}');
  assert.equal(await skillVersion(root), '0.2.0');
  assert.equal(await skillVersion(join(root, 'nada')), '0.0.0');
});

test('repoFromRemote entiende https y ssh de GitHub', () => {
  assert.equal(
    repoFromRemote('https://github.com/estudio-norte/lideris.git\n'),
    'estudio-norte/lideris',
  );
  assert.equal(repoFromRemote('git@github.com:estudio-norte/lideris.git'), 'estudio-norte/lideris');
  assert.equal(repoFromRemote('https://github.com/o/r.js'), 'o/r.js');
  assert.equal(repoFromRemote('https://gitlab.com/o/r.git'), null);
});
