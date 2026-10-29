import type { Anchor, ElementRef, FollowUp } from '../contract';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

export interface StoredReply {
  id: string;
  author: string;
  createdAt: Date;
  body: string;
}

@Schema({ collection: 'qa_comments', versionKey: false })
export class CommentDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true }) reviewId: string;
  @Prop({ required: true }) screenKey: string;
  @Prop({ required: true }) round: number;
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;
  @Prop({ type: Object, default: null }) anchor: Anchor | null;
  @Prop({ type: Object, default: null }) el: ElementRef | null;
  @Prop({ default: false }) resolved: boolean;
  @Prop({ type: String, default: null }) followUp: FollowUp;
  @Prop({ type: [Object], default: [] }) replies: StoredReply[];
  @Prop(nowProp) createdAt: Date;
}
export const CommentSchema = SchemaFactory.createForClass(CommentDoc);
CommentSchema.index({ reviewId: 1, screenKey: 1, createdAt: 1 });
