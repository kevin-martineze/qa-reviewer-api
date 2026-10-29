import type { NotificationPrefs, OrgRole, UserStatus } from '../contract';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

@Schema({ collection: 'qa_users', versionKey: false })
export class UserDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ type: String, enum: ['owner', 'admin', 'member'], default: 'member' }) orgRole: OrgRole;
  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' }) status: UserStatus;
  @Prop({ type: String, default: null }) avatar: string | null;
  @Prop({ type: Date, default: null }) lastSeenAt: Date | null;
  @Prop(nowProp) createdAt: Date;
  /** Qué tipos de notificación llegan también por correo; `null` = valores por defecto. */
  @Prop({ type: Object, default: null }) notificationPrefs: NotificationPrefs | null;
}
export const UserSchema = SchemaFactory.createForClass(UserDoc);

/** Credenciales aparte del usuario: el día que haya SSO, un usuario puede no tener contraseña. */
@Schema({ collection: 'qa_credentials', versionKey: false })
export class CredentialDoc {
  /** Id del usuario. */
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop(nowProp) updatedAt: Date;
}
export const CredentialSchema = SchemaFactory.createForClass(CredentialDoc);
