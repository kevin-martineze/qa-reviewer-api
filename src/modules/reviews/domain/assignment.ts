// Estrategias de asignación al publicar (docs/patterns.md, Strategy).
import type { Candidate } from './assignees';
import type { AssignmentStrategy, ModuleRule } from '../../../shared/contract';

import { REVIEWER_ROLES } from './assignees';

export interface AssignmentContext {
  candidates: readonly Candidate[];
  author: string;
  rules: readonly ModuleRule[];
  routes: readonly string[];
  roundRobinLast: string | null;
}

export interface Assignment {
  assignees: string[];
  /** Cursor del round robin después de asignar. */
  roundRobinLast: string | null;
}

const segments = (path: string) => path.split('/').filter(Boolean);

/**
 * ¿La ruta coincide con el patrón? `*` es un segmento; `**`, cero o más. Un `*` al final
 * cubre todo lo que cuelga del prefijo (`/preorders/*` incluye `/preorders/[id]/items`).
 * Recursivo sobre los sufijos de `**`, con memo por par de índices: O(p × r).
 */
export function matchRoute(pattern: string, route: string): boolean {
  const p = segments(pattern);
  const r = segments(route);
  if (p.at(-1) === '*') p[p.length - 1] = '+';
  const memo = new Map<string, boolean>();

  const match = (i: number, j: number): boolean => {
    const id = `${i}:${j}`;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    let result: boolean;
    const head = p[i];
    if (head === undefined) result = j === r.length;
    else if (head === '**') result = match(i + 1, j) || (j < r.length && match(i, j + 1));
    else if (head === '+') result = j < r.length;
    else if (j >= r.length) result = false;
    else
      result = (head === '*' || head.toLowerCase() === r[j]?.toLowerCase()) && match(i + 1, j + 1);
    memo.set(id, result);
    return result;
  };
  return match(0, 0);
}

function reviewers(ctx: AssignmentContext): string[] {
  return ctx.candidates
    .filter((c) => c.active && REVIEWER_ROLES.includes(c.role) && c.userId !== ctx.author)
    .map((c) => c.userId)
    .sort();
}

const STRATEGIES: Record<AssignmentStrategy, (ctx: AssignmentContext) => Assignment> = {
  /** Nadie: asigna el líder de diseño. */
  manual: (ctx) => ({ assignees: [], roundRobinLast: ctx.roundRobinLast }),

  /** El siguiente revisor después del último asignado, en orden de id (circular). */
  round_robin: (ctx) => {
    const pool = reviewers(ctx);
    if (!pool.length) return { assignees: [], roundRobinLast: ctx.roundRobinLast };
    const next = pool.find((id) => ctx.roundRobinLast === null || id > ctx.roundRobinLast);
    const chosen = next ?? pool[0] ?? '';
    return { assignees: [chosen], roundRobinLast: chosen };
  },

  /**
   * La primera regla, en el orden del arreglo, cuya ruta coincide con alguna pantalla y cuyo
   * revisor sirve. Si ninguna sirve, se reparte por turnos.
   */
  by_module: (ctx) => {
    const pool = new Set(reviewers(ctx));
    for (const rule of ctx.rules) {
      if (!pool.has(rule.userId)) continue;
      if (ctx.routes.some((route) => matchRoute(rule.pattern, route))) {
        return { assignees: [rule.userId], roundRobinLast: ctx.roundRobinLast };
      }
    }
    return STRATEGIES.round_robin(ctx);
  },
};

export function assign(strategy: AssignmentStrategy, ctx: AssignmentContext): Assignment {
  return STRATEGIES[strategy](ctx);
}
