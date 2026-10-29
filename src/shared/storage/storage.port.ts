/** Almacenamiento de capturas (ADR 0004). Las imágenes nunca pasan por el API: solo se firman. */
export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface ObjectInfo {
  bytes: number;
  contentType: string;
}

export interface StoragePort {
  presignPut(key: string, contentType: string, bytes: number): Promise<PresignedUpload>;
  presignGet(key: string): Promise<string>;
  head(key: string): Promise<ObjectInfo | null>;
  /** Escritura directa: solo la usan la semilla y las pruebas. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

export const STORAGE = Symbol('STORAGE');
export const URL_TTL_SECONDS = 15 * 60;
