import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { idProp, nowProp } from './common';

/** Token personal de la skill (`qa_pat_…`), atado a un proyecto. */
@Schema({ collection: 'qa_api_tokens', versionKey: false })
export class ApiTokenDoc {
  @Prop(idProp) _id: string;
  @Prop({ required: true, unique: true }) hash: string;
  /** Primeros caracteres del secreto, para reconocerlo en la lista. */
  @Prop({ required: true }) prefix: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) projectId: string;
  @Prop(nowProp) createdAt: Date;
  @Prop({ type: Date, default: null }) lastUsedAt: Date | null;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
}
export const ApiTokenSchema = SchemaFactory.createForClass(ApiTokenDoc);
