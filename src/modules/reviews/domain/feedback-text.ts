// Texto de `/design-review status`: lo que diseño pidió, listo para pegar en la sesión.
import type { Comment, Review } from '../../../shared/contract';

const RESULT: Record<'approved' | 'changes_requested', string> = {
  approved: 'aprobada',
  changes_requested: 'con ajustes pedidos',
};

/** Ronda más reciente con envío, o `null` si diseño todavía no envió ninguna. */
export function lastSubmittedRound(review: Review): number | null {
  const rounds = review.rounds.filter((r) => r.submission).map((r) => r.n);
  return rounds.length ? Math.max(...rounds) : null;
}

export function feedbackText(
  review: Review,
  comments: readonly Comment[],
  names: ReadonlyMap<string, string>,
  url: string,
): string {
  const name = (id: string) => names.get(id) ?? id;
  const lines = [`${review.id} · ${review.title}`];
  const n = lastSubmittedRound(review);
  const round = review.rounds.find((r) => r.n === n);
  const submission = round?.submission;

  if (!round || !submission) {
    const pending = review.screens.filter((s) => s.verdict === 'pending').length;
    lines.push(
      `Ronda ${review.round}: diseño todavía no envía su revisión (${pending} de ${review.screens.length} pantallas sin veredicto).`,
    );
    lines.push('', `Ver en la web: ${url}`);
    return lines.join('\n');
  }

  lines.push(
    `Ronda ${round.n}: ${RESULT[submission.result]} por ${name(submission.by)} (${submission.approved} aprobadas, ${submission.changes} con ajustes).`,
  );
  if (submission.body) lines.push(`Mensaje: ${submission.body}`);

  const byScreen = new Map<string, Comment[]>();
  for (const c of comments) byScreen.set(c.screen, [...(byScreen.get(c.screen) ?? []), c]);

  const toFix = review.screens.filter(
    (s) => round.verdicts[s.key] === 'changes_requested' || byScreen.has(s.key),
  );
  if (toFix.length) lines.push('', 'Pantallas por revisar:');
  toFix.forEach((screen, i) => {
    const verdict = round.verdicts[screen.key] === 'changes_requested' ? 'ajustes' : 'comentarios';
    lines.push(`${i + 1}. ${screen.title} (${screen.key}) · ${screen.route} · ${verdict}`);
    for (const c of byScreen.get(screen.key) ?? []) {
      const where = c.el ? ` → ${c.el.name} (${c.el.file}:${c.el.line})` : '';
      lines.push(`   - ${name(c.author)}: «${c.body}»${where}`);
      for (const reply of c.replies) lines.push(`     ↳ ${name(reply.author)}: «${reply.body}»`);
    }
  });

  lines.push('', `Ver en la web: ${url}`);
  return lines.join('\n');
}
