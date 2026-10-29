import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import type { Membership, OrgRole } from '../contract';

import { idProp, nowProp } from './common';

@Schema({ collection: 'qa_invitations', versionKey: false })
export class InvitationDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ required: true, lowercase: true, trim: true, index: true }) email: string;
  @Prop({ type: String, enum: ['owner', 'admin', 'member'], required: true }) role: OrgRole;
  @Prop({ type: [{ _id: false, projectId: String, role: String }], default: [] })
  projects: Membership[];
  @Prop({ required: true }) invitedBy: string;
  @Prop(nowProp) createdAt: Date;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) usedAt: Date | null;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
}
export const InvitationSchema = SchemaFactory.createForClass(InvitationDoc);

@Schema({ collection: 'qa_recoveries', versionKey: false })
export class RecoveryDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ required: true }) userId: string;
  @Prop(nowProp) createdAt: Date;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) usedAt: Date | null;
}
export const RecoverySchema = SchemaFactory.createForClass(RecoveryDoc);
