/**
 * JSON con las claves ordenadas en cada nivel: dos bodies iguales con las claves en otro orden
 * dan el mismo texto (y el mismo hash de idempotencia). Recursivo; la profundidad la acota el
 * esquema Joi del body. O(n log n) por el orden de claves.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
