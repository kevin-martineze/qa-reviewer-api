import type { StoredReviewStatus } from '../../../shared/schemas';

import { addBusinessDays } from '../../../shared/util/dates';

/** El plazo solo corre mientras diseño tiene la pelota. */
export const DESIGN_TURN: readonly StoredReviewStatus[] = ['open', 'in_review'];

export function isOverdue(status: StoredReviewStatus, dueAt: Date | null, now: Date): boolean {
  return DESIGN_TURN.includes(status) && dueAt !== null && dueAt.getTime() < now.getTime();
}

/** Vence `slaDays` días hábiles después de que diseño recibe la revisión. */
export function dueFrom(start: Date, slaDays: number): Date {
  return addBusinessDays(start, slaDays);
}
