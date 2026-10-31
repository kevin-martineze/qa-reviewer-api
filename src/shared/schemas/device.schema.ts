import type { DeviceClient } from '../contract';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

/** `used`: la skill ya recogió el token. La web lo ve como `approved`. */
export type StoredDeviceStatus = 'pending' | 'approved' | 'denied' | 'used';

/** Solicitud de acceso de la skill (device flow). Vive 10 min; Mongo la borra 1 h después. */
@Schema({ collection: 'qa_devices', versionKey: false })
export class DeviceDoc {
  @Prop(idProp) _id: string;
  /** SHA-256 del secreto con el que la skill sondea. */
  @Prop({ required: true, unique: true }) deviceCodeHash: string;
  /** SHA-256 del código de 8 letras, sin guion. */
  @Prop({ required: true, unique: true }) userCodeHash: string;
  @Prop({ type: Object, required: true }) client: DeviceClient;
  @Prop({ type: String, default: null }) repo: string | null;
  @Prop({ type: String, required: true }) status: StoredDeviceStatus;
  /** Quién aprobó o rechazó, y para qué proyecto y con qué etiqueta se crea el token. */
  @Prop({ type: String, default: null }) userId: string | null;
  @Prop({ type: String, default: null }) projectId: string | null;
  @Prop({ type: String, default: null }) label: string | null;
  @Prop(nowProp) createdAt: Date;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null }) lastPolledAt: Date | null;
}
export const DeviceSchema = SchemaFactory.createForClass(DeviceDoc);
DeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

/** Contador de una ventana fija de tiempo para límites de uso. */
@Schema({ collection: 'qa_rate_limits', versionKey: false })
export class RateLimitDoc {
  /** `<clave>:<inicio de la ventana en ms>`. */
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ default: 0 }) count: number;
  @Prop({ type: Date, required: true }) expiresAt: Date;
}
export const RateLimitSchema = SchemaFactory.createForClass(RateLimitDoc);
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
