// Métricas de `GET /reports/overview` (docs/algorithms.md). Funciones puras sobre las revisiones
// ya filtradas por proyecto y rango.
import type { ReportsOverview, Verdict } from '../../../shared/contract';
import type { StoredReviewStatus } from '../../../shared/schemas';

import { DAY, HOUR } from '../../../shared/util/dates';
import { isOverdue } from '../../reviews/domain/due';

export interface MetricReview {
  status: StoredReviewStatus;
  round: number;
  module: string;
  assignees: string[];
  screens: number;
  /** Cuándo quedó `open`; las horas y las semanas cuentan desde aquí. */
  openedAt: Date;
  dueAt: Date | null;
  rounds: Array<{
    n: number;
    verdicts: Record<string, Verdict>;
    submission: { createdAt: Date; result: 'approved' | 'changes_requested' } | null;
  }>;
}

export const WEEKS = 6;

/** Centro de la lista ordenada; con cantidad par, el promedio de los dos centrales. 0 si vacía. */
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

const hoursSince = (from: Date, to: Date) => (to.getTime() - from.getTime()) / HOUR;

const firstSubmission = (r: MetricReview) =>
  [...r.rounds].sort((a, b) => a.n - b.n).find((x) => x.submission)?.submission ?? null;

const firstApproval = (r: MetricReview) =>
  [...r.rounds].sort((a, b) => a.n - b.n).find((x) => x.submission?.result === 'approved')
    ?.submission ?? null;

const isPending = (r: MetricReview) => r.status === 'open' || r.status === 'in_review';

/** Seis ventanas de 7 días que terminan en `now`; cada una se rotula con su día final. */
export function weekly(reviews: readonly MetricReview[], now: Date): ReportsOverview['weekly'] {
  return Array.from({ length: WEEKS }, (_, i) => {
    const end = now.getTime() - (WEEKS - 1 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = (date: Date) => date.getTime() > start && date.getTime() <= end;
    return {
      week: new Date(end).toISOString().slice(0, 10),
      opened: reviews.filter((r) => inWeek(r.openedAt)).length,
      approved: reviews.filter((r) =>
        r.rounds.some((x) => x.submission?.result === 'approved' && inWeek(x.submission.createdAt)),
      ).length,
    };
  });
}

export function overview(reviews: readonly MetricReview[], now: Date): ReportsOverview {
  const toFirst = reviews.flatMap((r) => {
    const s = firstSubmission(r);
    return s ? [hoursSince(r.openedAt, s.createdAt)] : [];
  });
  const toApproval = reviews.flatMap((r) => {
    const s = firstApproval(r);
    return s ? [hoursSince(r.openedAt, s.createdAt)] : [];
  });
  const firstRound = reviews.flatMap((r) => {
    const s = r.rounds.find((x) => x.n === 1)?.submission;
    return s ? [s.result] : [];
  });

  const designers = new Map<string, { pending: number; overdue: number }>();
  for (const r of reviews) {
    if (!isPending(r)) continue;
    const late = isOverdue(r.status, r.dueAt, now);
    for (const userId of r.assignees) {
      const row = designers.get(userId) ?? { pending: 0, overdue: 0 };
      row.pending += 1;
      if (late) row.overdue += 1;
      designers.set(userId, row);
    }
  }

  const modules = new Map<string, { changes: number; screens: number }>();
  for (const r of reviews) {
    const row = modules.get(r.module) ?? { changes: 0, screens: 0 };
    for (const round of r.rounds) {
      row.changes += Object.values(round.verdicts).filter((v) => v === 'changes_requested').length;
    }
    row.screens += r.screens;
    modules.set(r.module, row);
  }

  return {
    open: reviews.filter(isPending).length,
    overdue: reviews.filter((r) => isOverdue(r.status, r.dueAt, now)).length,
    hoursToFirstReview: Math.round(median(toFirst)),
    hoursToApproval: Math.round(median(toApproval)),
    firstRoundApprovalRate: firstRound.length
      ? firstRound.filter((x) => x === 'approved').length / firstRound.length
      : 0,
    avgRounds: reviews.length
      ? Math.round((reviews.reduce((n, r) => n + r.round, 0) / reviews.length) * 10) / 10
      : 0,
    pendingByDesigner: [...designers]
      .map(([userId, row]) => ({ userId, ...row }))
      .sort((a, b) => b.pending - a.pending || a.userId.localeCompare(b.userId)),
    changesByModule: [...modules]
      .map(([module, row]) => ({ module, ...row }))
      .sort((a, b) => b.changes - a.changes || a.module.localeCompare(b.module)),
    weekly: weekly(reviews, now),
  };
}
