// Consulta de `GET /reviews`: filtros, visibilidad, orden y paginación en un solo aggregate.
import type { Priority, ReviewStatus } from '../../shared/contract';
import type { StoredReviewStatus } from '../../shared/schemas';
import type { PipelineStage } from 'mongoose';

import { DESIGN_TURN } from './domain/due';
import { PUBLISHED_STATUSES } from './domain/review-state';

export type ReviewSort = 'updated' | 'due' | 'priority';

export interface ReviewFilters {
  status?: ReviewStatus[];
  project?: string;
  author?: string;
  assignee?: string;
  priority?: Priority;
  overdue?: boolean;
  q?: string;
  sort: ReviewSort;
  page: number;
  limit: number;
}

const PRIORITY_RANK: readonly Priority[] = ['urgent', 'high', 'medium', 'low'];
/** Sin plazo va al final al ordenar por vencimiento. */
const NO_DUE = new Date(8.64e15);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtro de Mongo. `visibleProjects` = `null` para owner y admin (ven todo).
 * Borradores y vencidas nunca salen, aunque se pidan.
 */
export function reviewMatch(
  filters: ReviewFilters,
  visibleProjects: readonly string[] | null,
  now: Date,
): Record<string, unknown> {
  let statuses: readonly StoredReviewStatus[] = PUBLISHED_STATUSES;
  const wanted = new Set<string>(filters.status ?? []);
  if (wanted.size) statuses = statuses.filter((s) => wanted.has(s));
  if (filters.overdue) statuses = statuses.filter((s) => DESIGN_TURN.includes(s));

  const match: Record<string, unknown> = { status: { $in: statuses } };
  if (filters.project) {
    const visible = visibleProjects === null || visibleProjects.includes(filters.project);
    match.projectId = visible ? filters.project : { $in: [] };
  } else if (visibleProjects !== null) {
    match.projectId = { $in: visibleProjects };
  }
  if (filters.author) match.author = filters.author;
  if (filters.assignee) match.assignees = filters.assignee;
  if (filters.priority) match.priority = filters.priority;
  if (filters.overdue) match.dueAt = { $lt: now };

  const q = filters.q?.trim();
  if (q) {
    const regex = escapeRegex(q);
    const re = new RegExp(regex, 'i');
    match.$or = [
      { _id: re },
      { title: re },
      { 'card.key': re },
      { module: re },
      { $expr: { $regexMatch: { input: { $toString: '$pr.number' }, regex, options: 'i' } } },
    ];
  }
  return match;
}

/** Orden estable: el criterio pedido y, al empate, lo más reciente primero. */
function sortStages(sort: ReviewSort): PipelineStage[] {
  const tail = { updatedAt: -1 as const, _id: -1 as const };
  if (sort === 'priority') {
    return [
      { $addFields: { _rank: { $indexOfArray: [PRIORITY_RANK, '$priority'] } } },
      { $sort: { _rank: 1, ...tail } },
    ];
  }
  if (sort === 'due') {
    return [
      { $addFields: { _due: { $ifNull: ['$dueAt', NO_DUE] } } },
      { $sort: { _due: 1, ...tail } },
    ];
  }
  return [{ $sort: tail }];
}

/** Una página y el total en una sola ida a Mongo. */
export function reviewListPipeline(
  filters: ReviewFilters,
  visibleProjects: readonly string[] | null,
  now: Date,
): PipelineStage[] {
  return [
    { $match: reviewMatch(filters, visibleProjects, now) },
    {
      $facet: {
        items: [
          ...(sortStages(filters.sort) as PipelineStage.FacetPipelineStage[]),
          { $skip: (filters.page - 1) * filters.limit },
          { $limit: filters.limit },
          { $project: { _rank: 0, _due: 0, pending: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];
}
