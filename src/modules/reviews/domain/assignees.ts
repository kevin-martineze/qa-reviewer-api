import type { ProjectRole } from '../../../shared/contract';

/** Quién puede revisar: diseñadores y líderes de diseño del proyecto. */
export const REVIEWER_ROLES: readonly ProjectRole[] = ['designer', 'design_lead'];

export interface Candidate {
  userId: string;
  role: ProjectRole;
  active: boolean;
}

/**
 * Asignados que no sirven: no son diseñadores activos del proyecto o son el autor
 * (nadie revisa su propio trabajo). Una lista vacía también es inválida.
 */
export function invalidAssignees(
  requested: readonly string[],
  candidates: readonly Candidate[],
  author: string,
): string[] | null {
  if (!requested.length) return [];
  const eligible = new Set(
    candidates.filter((c) => c.active && REVIEWER_ROLES.includes(c.role)).map((c) => c.userId),
  );
  const invalid = requested.filter((id) => id === author || !eligible.has(id));
  return invalid.length ? invalid : null;
}
