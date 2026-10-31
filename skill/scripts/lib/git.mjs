// Lo que el cliente necesita del repositorio: `owner/repo` de origin y el PR de la rama.
// Si git o gh no están (o no hay PR), devuelve `null` y el cliente pide el dato.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** `owner/repo` de una URL de GitHub (https o ssh), o `null`. */
export function repoFromRemote(url) {
  const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function gitRepo(run = exec) {
  try {
    const { stdout } = await run('git', ['remote', 'get-url', 'origin']);
    return repoFromRemote(stdout);
  } catch {
    return null;
  }
}

/** Número del PR de la rama actual según `gh`, o `null`. */
export async function currentPr(run = exec) {
  try {
    const { stdout } = await run('gh', ['pr', 'view', '--json', 'number', '-q', '.number']);
    const n = Number.parseInt(stdout.trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
