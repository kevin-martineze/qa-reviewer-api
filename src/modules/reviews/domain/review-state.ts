// Máquina de estados de la revisión (docs/data-model.md). El servicio pregunta aquí si un
// comando aplica y escribe con `findOneAndUpdate({ _id, status: desde })`: si otro request
// cambió el estado entre medio, no actualiza y responde 409 `reviews.stale_status`.
import type { StoredReviewStatus } from '../../../shared/schemas';

export type ReviewCommand =
  /** La skill publica la primera ronda. */
  | 'publish'
  /** La skill publica una ronda nueva tras un envío. */
  | 'publish_round'
  /** Primer veredicto de la ronda. */
  | 'start_review'
  /** Diseño envía la ronda; el resultado decide el estado. */
  | 'submit'
  /** Se anula el último envío. */
  | 'reopen'
  /** El PR se cerró o se fusionó. */
  | 'close'
  /** Borrador sin publicar por más de 24 h. */
  | 'expire';

export type SubmitResult = 'approved' | 'changes_requested';

export const ACTIVE_STATUSES: readonly StoredReviewStatus[] = [
  'draft',
  'open',
  'in_review',
  'changes_requested',
  'approved',
];

/** Lo que la web ve: ni borradores ni vencidas. */
export const PUBLISHED_STATUSES: readonly StoredReviewStatus[] = [
  'open',
  'in_review',
  'changes_requested',
  'approved',
  'closed',
];

const FROM: Record<ReviewCommand, readonly StoredReviewStatus[]> = {
  publish: ['draft'],
  publish_round: ['changes_requested', 'approved'],
  start_review: ['open'],
  submit: ['in_review'],
  reopen: ['changes_requested', 'approved'],
  close: ACTIVE_STATUSES,
  expire: ['draft'],
};

/** Estados desde los que aplica el comando (para la guarda de la escritura). */
export function sourcesOf(command: ReviewCommand): readonly StoredReviewStatus[] {
  return FROM[command];
}

/** Estado siguiente, o `null` si el comando no aplica desde `from`. */
export function nextStatus(
  command: ReviewCommand,
  from: StoredReviewStatus,
  result?: SubmitResult,
): StoredReviewStatus | null {
  if (!FROM[command].includes(from)) return null;
  switch (command) {
    case 'publish':
    case 'publish_round':
      return 'open';
    case 'start_review':
    case 'reopen':
      return 'in_review';
    case 'submit':
      return result ?? null;
    case 'close':
      return 'closed';
    case 'expire':
      return 'expired';
  }
}
