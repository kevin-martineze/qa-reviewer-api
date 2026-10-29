export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function iso(date: Date): string;
export function iso(date: Date | null | undefined): string | null;
export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Suma días hábiles (lunes a viernes) conservando la hora. */
export function addBusinessDays(from: Date, days: number): Date {
  const out = new Date(from);
  let left = days;
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const day = out.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return out;
}
