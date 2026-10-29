import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import type { NotificationType } from '../contract';

import { idProp, nowProp } from './common';

@Schema({ collection: 'qa_notifications', versionKey: false })
export class NotificationDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true }) userId: string;
  @Prop({ type: String, required: true }) type: NotificationType;
  @Prop({ type: String, default: null }) actor: string | null;
  @Prop({ type: String, default: null }) review: string | null;
  @Prop({ type: String, default: null }) screen: string | null;
  @Prop({ type: String, default: null }) comment: string | null;
  @Prop({ required: true }) text: string;
  @Prop(nowProp) createdAt: Date;
  @Prop({ type: Date, default: null }) readAt: Date | null;
}
export const NotificationSchema = SchemaFactory.createForClass(NotificationDoc);
NotificationSchema.index({ userId: 1, createdAt: -1 });
