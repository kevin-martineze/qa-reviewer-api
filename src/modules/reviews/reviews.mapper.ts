import type { ActivityEvent, Review, ReviewStatus, Round, Screen } from '../../shared/contract';
import type {
  ActivityDoc,
  ReviewDoc,
  StoredCapture,
  StoredReviewStatus,
  StoredRound,
  StoredScreen,
} from '../../shared/schemas';

import { Inject, Injectable } from '@nestjs/common';

import { STORAGE, type StoragePort } from '../../shared/storage/storage.port';
import { iso } from '../../shared/util/dates';

/** `expired` no existe en el contrato: la web nunca ve esas revisiones. */
function publicStatus(status: StoredReviewStatus): ReviewStatus {
  return status === 'expired' ? 'closed' : status;
}

function toRound(round: StoredRound): Round {
  return {
    n: round.n,
    by: round.by,
    createdAt: iso(round.createdAt),
    note: round.note,
    changed: [...round.changed],
    verdicts: { ...round.verdicts },
    submission: round.submission
      ? { ...round.submission, createdAt: iso(round.submission.createdAt) }
      : null,
  };
}

export function toActivity(doc: ActivityDoc): ActivityEvent {
  return {
    id: doc._id,
    type: doc.type,
    actor: doc.actor,
    review: doc.review,
    text: doc.text,
    createdAt: iso(doc.createdAt),
  };
}

/** Revisión del contrato. Las capturas salen como URL firmada de lectura (15 min). */
@Injectable()
export class ReviewMapper {
  constructor(@Inject(STORAGE) private readonly storage: StoragePort) {}

  async toReview(doc: ReviewDoc): Promise<Review> {
    return {
      id: doc._id,
      title: doc.title,
      context: doc.context,
      card: doc.card.key,
      pr: {
        number: doc.pr.number,
        url: doc.pr.url,
        base: doc.pr.base,
        head: doc.pr.head,
        state: doc.pr.state,
        check: doc.pr.check,
        commit: doc.pr.commit,
      },
      project: doc.projectId,
      module: doc.module,
      author: doc.author,
      assignees: [...doc.assignees],
      status: publicStatus(doc.status),
      round: doc.round,
      priority: doc.priority,
      dueAt: iso(doc.dueAt),
      createdAt: iso(doc.createdAt),
      updatedAt: iso(doc.updatedAt),
      screens: await Promise.all(
        doc.screens.map((s) => this.toScreen(s, doc.assetsPurgedAt !== null)),
      ),
      rounds: doc.rounds.map(toRound),
      summary: {
        steps: doc.summary.steps.map((s) => ({ title: s.title, body: s.body })),
        rules: [...doc.summary.rules],
      },
      notCaptured: [...doc.notCaptured],
    };
  }

  toReviews(docs: ReviewDoc[]): Promise<Review[]> {
    return Promise.all(docs.map((d) => this.toReview(d)));
  }

  /** Con las capturas ya borradas por retención, las imágenes salen `null`. */
  private async toScreen(screen: StoredScreen, purged: boolean): Promise<Screen> {
    const [img, before, previous] = purged
      ? [null, null, null]
      : await Promise.all([
          this.sign(screen.after),
          this.sign(screen.before),
          this.sign(screen.previous),
        ]);
    return {
      key: screen.key,
      title: screen.title,
      lead: screen.lead,
      viewport: `${screen.viewport.width} × ${screen.viewport.height}`,
      route: screen.route,
      img,
      before,
      previous,
      changedIn: screen.changedIn,
      inherited: screen.inherited,
      roundNote: screen.roundNote,
      diff: screen.diff.map((b) => ({ ...b })),
      elements: screen.elements.map((e) => ({ ...e, box: { ...e.box } })),
      changes: [...screen.changes],
      questions: [...screen.questions],
      verdict: screen.verdict,
    };
  }

  private sign(capture: StoredCapture | null): Promise<string | null> {
    return capture ? this.storage.presignGet(capture.key) : Promise.resolve(null);
  }
}
