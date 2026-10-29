/** Índice único violado (E11000): dos escrituras compitieron por la misma clave. */
export function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
