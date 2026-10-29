// Resultado del envío de una ronda (docs/algorithms.md).
import type { Verdict } from '../../../shared/contract';

export interface SubmissionTally {
  /** Pantallas aún sin veredicto: si hay alguna, no se puede enviar. */
  pending: string[];
  approved: number;
  changes: number;
  result: 'approved' | 'changes_requested';
  verdicts: Record<string, Verdict>;
}

export function tally(screens: ReadonlyArray<{ key: string; verdict: Verdict }>): SubmissionTally {
  const verdicts: Record<string, Verdict> = {};
  const pending: string[] = [];
  let approved = 0;
  let changes = 0;
  for (const s of screens) {
    verdicts[s.key] = s.verdict;
    if (s.verdict === 'pending') pending.push(s.key);
    else if (s.verdict === 'approved') approved += 1;
    else changes += 1;
  }
  return {
    pending,
    approved,
    changes,
    result: changes ? 'changes_requested' : 'approved',
    verdicts,
  };
}

/** Frase de la actividad y de la notificación al autor. */
export function submissionSummary(round: number, t: SubmissionTally): string {
  return t.result === 'approved'
    ? `aprobó la ronda ${round} (${t.approved} pantallas)`
    : `envió la ronda ${round}: ${t.approved} aprobadas, ${t.changes} con ajuste`;
}
