import { Algorithm, hash, verify } from '@node-rs/argon2';

export const PASSWORD_MIN = 12;

const OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/** Hash de relleno: el login tarda lo mismo exista o no el correo. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('qa-reviewer-dummy-password');
  return dummy;
}
