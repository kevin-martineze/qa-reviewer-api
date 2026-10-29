import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import type { ActivityType, AuditType } from '../contract';

import { idProp, nowProp } from './common';

/** Línea de tiempo de una revisión. */
@Schema({ collection: 'qa_activity', versionKey: false })
export class ActivityDoc {
  @Prop(idProp) _id: string;
  @Prop({ type: String, required: true }) type: ActivityType;
  @Prop({ required: true }) actor: string;
  @Prop({ required: true }) review: string;
  @Prop({ required: true }) text: string;
  @Prop(nowProp) createdAt: Date;
}
export const ActivitySchema = SchemaFactory.createForClass(ActivityDoc);
ActivitySchema.index({ review: 1, createdAt: -1 });

/** Registro de la organización: usuarios, roles, miembros, tokens y proyectos. */
@Schema({ collection: 'qa_audit', versionKey: false })
export class AuditDoc {
  @Prop(idProp) _id: string;
  @Prop({ type: String, required: true }) type: AuditType;
  @Prop({ required: true }) actor: string;
  @Prop({ required: true }) target: string;
  @Prop({ required: true }) text: string;
  @Prop({ ...nowProp, index: true }) createdAt: Date;
}
export const AuditSchema = SchemaFactory.createForClass(AuditDoc);
