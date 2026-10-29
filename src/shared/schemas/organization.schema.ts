import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'qa_organizations', versionKey: false })
export class OrganizationDoc {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true }) name: string;
  @Prop({ type: Date, default: () => new Date() }) createdAt: Date;
}
export const OrganizationSchema = SchemaFactory.createForClass(OrganizationDoc);
