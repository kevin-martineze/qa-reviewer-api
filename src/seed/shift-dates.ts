const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Corre todas las fechas ISO de un JSON en `deltaMs`, sin conocer su forma.
 * La demo se exportó en un momento dado; al cargarla se mueve para que «hace 2 h»
 * y «vence mañana» sigan siendo ciertos. Recursivo: la profundidad la fija el
 * archivo de la semilla, que es del repo.
 */
export function shiftDates(value: unknown, deltaMs: number): unknown {
  if (typeof value === 'string') {
    return ISO.test(value) ? new Date(Date.parse(value) + deltaMs).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map((item) => shiftDates(item, deltaMs));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shiftDates(item, deltaMs)]),
    );
  }
  return value;
}
