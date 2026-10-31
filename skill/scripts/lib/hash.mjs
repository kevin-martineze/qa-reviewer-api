// Tamaño y SHA-256 de un archivo: el manifiesto declara los dos por cada captura y el API
// los compara con lo que llega al storage.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

export async function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

export async function fileInfo(path) {
  const [info, sha256] = await Promise.all([stat(path), sha256File(path)]);
  return { bytes: info.size, sha256 };
}
