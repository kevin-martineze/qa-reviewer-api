import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

export type OutboxStatus = 'pending' | 'processing' | 'delivered' | 'dead';

@Schema({ collection: 'qa_outbox', versionKey: false })
export class OutboxDoc {
  /** `eventId`: los consumidores son idempotentes por este id. */
  @Prop(idProp) _id: string;
  @Prop({ required: true }) type: string;
  @Prop({ type: Object, required: true }) payload: Record<string, unknown>;
  @Prop({ type: String, default: 'pending' }) status: OutboxStatus;
  @Prop({ default: 0 }) attempts: number;
  @Prop(nowProp) nextAttemptAt: Date;
  /** Notificadores que ya entregaron el evento: un reintento no los repite. */
  @Prop({ type: [String], default: [] }) delivered: string[];
  @Prop({ type: String, default: null }) lastError: string | null;
  @Prop(nowProp) occurredAt: Date;
  @Prop({ type: Date, default: null }) deliveredAt: Date | null;
}
export const OutboxSchema = SchemaFactory.createForClass(OutboxDoc);
OutboxSchema.index({ status: 1, nextAttemptAt: 1 });

@Schema({ collection: 'qa_idempotency', versionKey: false })
export class IdempotencyDoc {
  /** `<userId>:<Idempotency-Key>`. */
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true }) requestHash: string;
  @Prop({ type: Object, default: null }) response: { status: number; body: unknown } | null;
  @Prop(nowProp) createdAt: Date;
}
export const IdempotencySchema = SchemaFactory.createForClass(IdempotencyDoc);
IdempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });
