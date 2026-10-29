import type { OutboxEvent } from './outbox.service';

/**
 * Consumidor de eventos del outbox (Strategy). El worker no conoce a los notificadores:
 * recorre el registro y entrega cada evento a los que lo soportan.
 */
export interface Notifier {
  /** Nombre estable: el outbox recuerda a quién ya le entregó cada evento. */
  readonly name: string;
  supports(event: OutboxEvent): boolean;
  handle(event: OutboxEvent): Promise<void>;
}

export const NOTIFIERS = Symbol('NOTIFIERS');
