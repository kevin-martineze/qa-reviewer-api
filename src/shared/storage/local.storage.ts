import type { ObjectInfo, PresignedUpload, StoragePort } from './storage.port';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import { URL_TTL_SECONDS } from './storage.port';

const META_SUFFIX = '.meta.json';

/**
 * Storage en disco para desarrollo y demo. Firma las URLs con HMAC y las sirve el propio API
 * (`/v1/storage/*`), con la misma semántica que S3: PUT con tipo y tamaño fijos, GET con TTL.
 */
export class LocalStorage implements StoragePort {
  private readonly root: string;

  constructor(
    dir: string,
    private readonly secret: string,
    private readonly publicApiUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.root = resolve(dir);
  }

  async presignPut(key: string, contentType: string, bytes: number): Promise<PresignedUpload> {
    const exp = this.expiry();
    const sig = this.sign('PUT', key, exp, contentType, bytes);
    const query = new URLSearchParams({
      exp: String(exp),
      ct: contentType,
      len: String(bytes),
      sig,
    });
    return {
      url: `${this.base()}/${encodeKey(key)}?${query.toString()}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async presignGet(key: string): Promise<string> {
    const exp = this.expiry();
    const sig = this.sign('GET', key, exp);
    return `${this.base()}/${encodeKey(key)}?exp=${exp}&sig=${sig}`;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const info = await stat(this.path(key));
      const meta = await this.meta(key);
      return { bytes: info.size, contentType: meta?.contentType ?? contentTypeOf(key) };
    } catch {
      return null;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(file + META_SUFFIX, JSON.stringify({ contentType }));
  }

  async read(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const body = await readFile(this.path(key));
      const meta = await this.meta(key);
      return { body, contentType: meta?.contentType ?? contentTypeOf(key) };
    } catch {
      return null;
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    const dir = this.path(prefix);
    const count = await countFiles(dir);
    await rm(dir, { recursive: true, force: true });
    return count;
  }

  /** Verifica una URL firmada. `ct`/`len` solo aplican al PUT. */
  verify(
    method: 'GET' | 'PUT',
    key: string,
    query: { exp?: string; sig?: string; ct?: string; len?: string },
  ): boolean {
    const exp = Number(query.exp);
    if (!Number.isFinite(exp) || exp * 1000 < this.now().getTime() || !query.sig) return false;
    const expected =
      method === 'PUT'
        ? this.sign('PUT', key, exp, query.ct ?? '', Number(query.len))
        : this.sign('GET', key, exp);
    const a = Buffer.from(expected);
    const b = Buffer.from(query.sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private sign(method: string, key: string, exp: number, ct = '', len = 0): string {
    return createHmac('sha256', this.secret)
      .update([method, key, exp, ct, len].join('\n'))
      .digest('base64url');
  }

  private expiry(): number {
    return Math.floor(this.now().getTime() / 1000) + URL_TTL_SECONDS;
  }

  private base(): string {
    return `${this.publicApiUrl.replace(/\/$/, '')}/v1/storage`;
  }

  /** Ruta dentro de `root`; una clave con `..` no puede salir del directorio. */
  private path(key: string): string {
    const file = normalize(join(this.root, key));
    if (file !== this.root && !file.startsWith(this.root + sep)) {
      throw new Error('Clave de storage inválida');
    }
    return file;
  }

  private async meta(key: string): Promise<{ contentType: string } | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path(key) + META_SUFFIX, 'utf8'));
      if (typeof raw === 'object' && raw !== null && 'contentType' in raw) {
        const ct = raw.contentType;
        if (typeof ct === 'string') return { contentType: ct };
      }
      return null;
    } catch {
      return null;
    }
  }
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export function contentTypeOf(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.svg')) return 'image/svg+xml';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/** Cuenta archivos bajo un directorio recorriendo sus subcarpetas (recursivo). */
async function countFiles(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) total += await countFiles(join(dir, entry.name));
    else if (!entry.name.endsWith(META_SUFFIX)) total += 1;
  }
  return total;
}
