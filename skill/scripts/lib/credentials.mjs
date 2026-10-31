// Credenciales de la skill: un token por URL del API, en ~/.config/qa-reviewer (o
// $XDG_CONFIG_HOME/qa-reviewer). Archivos con permiso 600: el token da acceso al proyecto.
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { normalizeBaseUrl } from './api.mjs';

export function configDir(env = process.env) {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'qa-reviewer');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`No se pudo leer ${path}: ${error.message}`);
  }
}

async function writeJson(dir, name, value) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  // writeFile no cambia el modo de un archivo que ya existía.
  await chmod(path, 0o600);
  return path;
}

/**
 * Guarda y lee por URL del API. `credentials.json`: `{ "<apiUrl>": { token, project, user,
 * savedAt } }`. `pending.json`: el login por navegador en curso, para retomarlo.
 */
export function credentialStore(dir = configDir()) {
  const file = (name) => join(dir, name);

  async function update(name, apiUrl, value) {
    const all = await readJson(file(name));
    const key = normalizeBaseUrl(apiUrl);
    if (value === null) delete all[key];
    else all[key] = value;
    return writeJson(dir, name, all);
  }

  return {
    path: file('credentials.json'),
    async get(apiUrl) {
      return (await readJson(file('credentials.json')))[normalizeBaseUrl(apiUrl)] ?? null;
    },
    save: (apiUrl, value) => update('credentials.json', apiUrl, value),
    remove: (apiUrl) => update('credentials.json', apiUrl, null),
    async getPending(apiUrl) {
      return (await readJson(file('pending.json')))[normalizeBaseUrl(apiUrl)] ?? null;
    },
    savePending: (apiUrl, value) => update('pending.json', apiUrl, value),
    clearPending: (apiUrl) => update('pending.json', apiUrl, null),
    /** Borra todo (solo para pruebas). */
    clear: () => rm(dir, { recursive: true, force: true }),
  };
}
