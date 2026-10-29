import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

/** Sesión de la web (ADR 0009). Solo se guarda el hash del token. */
@Schema({ collection: 'qa_sessions', versionKey: false })
export class SessionDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop(nowProp) createdAt: Date;
  @Prop(nowProp) lastUsedAt: Date;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
  @Prop({ type: String, default: null }) userAgent: string | null;
}
export const SessionSchema = SchemaFactory.createForClass(SessionDoc);
// Mongo borra las sesiones vencidas un día después de vencer.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });
