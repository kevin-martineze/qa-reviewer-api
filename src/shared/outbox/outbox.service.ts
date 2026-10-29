import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';

import { OutboxDoc } from '../schemas';
import { ClockService } from '../util/clock.service';

export type OutboxEventType =
  | 'ReviewOpened'
  | 'ReviewSubmitted'
  | 'ReviewReopened'
  | 'ReviewClosed'
  | 'NotificationCreated'
  | 'InvitationCreated'
  | 'RecoveryRequested';

export interface OutboxEvent {
  id: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
}

/** Escribe eventos junto con el cambio de estado (misma sesión = misma transacción). */
@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxDoc.name) private readonly outbox: Model<OutboxDoc>,
    private readonly clock: ClockService,
  ) {}

  async publish(
    type: OutboxEventType,
    payload: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<string> {
    const now = this.clock.now();
    const [doc] = await this.outbox.create(
      [{ type, payload, occurredAt: now, nextAttemptAt: now }],
      { session },
    );
    return doc?._id ?? '';
  }
}
