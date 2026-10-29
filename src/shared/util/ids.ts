import { createHash, randomBytes } from 'node:crypto';

import { Types } from 'mongoose';

/** Id opaco de documento: hex de ObjectId (ordenable por fecha de creación). */
export function newId(): string {
  return new Types.ObjectId().toHexString();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
