import type { ModuleRule } from '../../../shared/contract';

/**
 * Personas de las reglas por módulo que no son miembros del proyecto, sin repetir.
 * La asignación por módulo solo puede caer en alguien que vea el proyecto.
 */
export function strangersIn(rules: readonly ModuleRule[], memberIds: Iterable<string>): string[] {
  const members = new Set(memberIds);
  return [...new Set(rules.map((r) => r.userId))].filter((userId) => !members.has(userId));
}
