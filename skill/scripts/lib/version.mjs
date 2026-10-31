// Versión de la skill (la de plugin.json) y comparación semver simple: X.Y.Z.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del plugin: `skill/`. */
export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function skillVersion(root = PLUGIN_ROOT) {
  for (const file of ['.claude-plugin/plugin.json', 'package.json']) {
    try {
      const { version } = JSON.parse(await readFile(join(root, file), 'utf8'));
      if (typeof version === 'string') return version;
    } catch {
      // Sigue con el siguiente.
    }
  }
  return '0.0.0';
}

/** -1, 0 o 1. Lo que no es X.Y.Z cuenta como 0.0.0. */
export function compareVersions(a, b) {
  const parse = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : [0, 0, 0]);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}
