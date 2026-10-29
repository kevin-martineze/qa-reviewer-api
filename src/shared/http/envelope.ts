/** Respuesta estándar: `{ messageKey, data }`. Los comandos sin cuerpo responden 204. */
export interface Envelope<T> {
  messageKey: string;
  data: T;
}

export function envelope<T>(messageKey: string, data: T): Envelope<T> {
  return { messageKey, data };
}
