import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { ENV, type Env } from '../../config/env';
import { OutboxDoc } from '../schemas';
import { ClockService } from '../util/clock.service';

import { NOTIFIERS, type Notifier } from './notifier';
import type { OutboxEvent, OutboxEventType } from './outbox.service';

export const MAX_ATTEMPTS = 8;
const BATCH = 20;
const STALE_MS = 2 * 60_000;

/** Espera antes del intento `n` (1, 2, 3…): 5 s, 10 s, 20 s… hasta 30 min. */
export function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** (attempt - 1), 30 * 60_000);
}

/** Entrega los eventos pendientes a los notificadores, con reintentos y espera exponencial. */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(OutboxDoc.name) private readonly outbox: Model<OutboxDoc>,
    @Inject(NOTIFIERS) private readonly notifiers: Notifier[],
    @Inject(ENV) private readonly env: Env,
    private readonly clock: ClockService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.JOBS_ENABLED) return;
    this.timer = setInterval(() => void this.tick(), this.env.OUTBOX_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drain();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Procesa hasta `BATCH` eventos. Devuelve cuántos tomó (las pruebas lo llaman directo). */
  async drain(): Promise<number> {
    let processed = 0;
    for (; processed < BATCH; processed += 1) {
      const claimed = await this.claim();
      if (!claimed) break;
      await this.process(claimed);
    }
    return processed;
  }

  private async claim(): Promise<OutboxDoc | null> {
    const now = this.clock.now();
    return this.outbox
      .findOneAndUpdate(
        {
          $or: [
            { status: 'pending', nextAttemptAt: { $lte: now } },
            // Un worker que murió a mitad deja eventos en `processing`: se retoman.
            { status: 'processing', nextAttemptAt: { $lte: new Date(now.getTime() - STALE_MS) } },
          ],
        },
        { $set: { status: 'processing', nextAttemptAt: now } },
        { sort: { nextAttemptAt: 1 }, new: true },
      )
      .lean();
  }

  private async process(doc: OutboxDoc): Promise<void> {
    const event: OutboxEvent = {
      id: doc._id,
      type: doc.type as OutboxEventType,
      payload: doc.payload,
      occurredAt: doc.occurredAt,
      attempts: doc.attempts,
    };
    const delivered = new Set(doc.delivered);
    let failure: string | null = null;

    for (const notifier of this.notifiers) {
      if (delivered.has(notifier.name) || !notifier.supports(event)) continue;
      try {
        await notifier.handle(event);
        delivered.add(notifier.name);
      } catch (error) {
        failure = `${notifier.name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const now = this.clock.now();
    if (!failure) {
      await this.outbox.updateOne(
        { _id: doc._id },
        { status: 'delivered', delivered: [...delivered], deliveredAt: now, lastError: null },
      );
      return;
    }
    const attempts = doc.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    if (dead) this.logger.error(`Evento ${doc.type} ${doc._id} sin entregar: ${failure}`);
    await this.outbox.updateOne(
      { _id: doc._id },
      {
        status: dead ? 'dead' : 'pending',
        attempts,
        delivered: [...delivered],
        lastError: failure,
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
      },
    );
  }
}
