// Códigos del login por navegador (docs/algorithms.md, «Login de la skill»).
import type { DeviceStatus } from '../../../shared/contract';
import type { StoredDeviceStatus } from '../../../shared/schemas';

/** 32 letras y dígitos sin los que se confunden al leerlos: 0/O y 1/I. */
export const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const USER_CODE_LENGTH = 8;
/** Vida del código, en segundos. */
export const DEVICE_TTL_SECONDS = 600;
/** Espera mínima entre sondeos, en segundos. */
export const POLL_INTERVAL_SECONDS = 5;

const VALID = new RegExp(`^[${USER_CODE_ALPHABET}]{${USER_CODE_LENGTH}}$`);

/** Código nuevo de 8 caracteres, sin guion. `random(n)` devuelve un entero en [0, n). */
export function newUserCode(random: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < USER_CODE_LENGTH; i += 1) {
    code += USER_CODE_ALPHABET.charAt(random(USER_CODE_ALPHABET.length));
  }
  return code;
}

/**
 * Lo que la persona escribió, en la forma guardada: mayúsculas, sin guion ni espacios. `null`
 * si no puede ser un código.
 */
export function normalizeUserCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return VALID.test(code) ? code : null;
}

/** `ABCDEFGH` → `ABCD-EFGH`. */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Estado que ve la web: `used` se muestra como aprobado; uno sin decidir y vencido, como vencido. */
export function deviceStatus(status: StoredDeviceStatus, expiresAt: Date, now: Date): DeviceStatus {
  if (status === 'used') return 'approved';
  if (status === 'pending' && expiresAt.getTime() <= now.getTime()) return 'expired';
  return status;
}

/** ¿Sondeó antes de tiempo? */
export function pollsTooSoon(lastPolledAt: Date | null, now: Date): boolean {
  return (
    lastPolledAt !== null && now.getTime() - lastPolledAt.getTime() < POLL_INTERVAL_SECONDS * 1000
  );
}
