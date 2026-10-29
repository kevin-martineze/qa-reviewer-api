import type { AssignmentStrategy, ModuleRule, ProjectIntegrations, ProjectRole } from '../contract';

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { nowProp } from './common';

export interface ProjectLimits {
  maxScreens: number;
  maxBytes: number;
  contentTypes: string[];
  viewportMin: number;
  viewportMax: number;
}

export const DEFAULT_LIMITS: ProjectLimits = {
  maxScreens: 40,
  maxBytes: 5 * 1024 * 1024,
  contentTypes: ['image/png', 'image/webp'],
  viewportMin: 1024,
  viewportMax: 1920,
};

export const DEFAULT_INTEGRATIONS: ProjectIntegrations = {
  github: { connected: false, repo: '', checkName: 'design-review', commentOnPr: true },
  plane: { connected: false, projectKey: '', commentOnCard: true },
};

@Schema({ collection: 'qa_projects', versionKey: false })
export class ProjectDoc {
  /** Slug (ADR 0010). */
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) repo: string;
  @Prop({ default: '' }) planeKey: string;
  @Prop({ default: 2 }) slaDays: number;
  @Prop({ type: String, enum: ['manual', 'round_robin', 'by_module'], default: 'manual' })
  strategy: AssignmentStrategy;
  @Prop({ type: [{ _id: false, pattern: String, userId: String }], default: [] })
  moduleRules: ModuleRule[];
  @Prop({ type: Object, default: () => structuredClone(DEFAULT_INTEGRATIONS) })
  integrations: ProjectIntegrations;
  @Prop({ type: [String], default: [] }) maskSelectors: string[];
  @Prop({ type: [String], default: [] }) designRules: string[];
  @Prop({ type: Object, default: () => ({ ...DEFAULT_LIMITS }) }) limits: ProjectLimits;
  /** Último diseñador asignado por round robin. */
  @Prop({ type: String, default: null }) roundRobinLast: string | null;
  @Prop(nowProp) createdAt: Date;
}
export const ProjectSchema = SchemaFactory.createForClass(ProjectDoc);

@Schema({ collection: 'qa_members', versionKey: false })
export class MemberDoc {
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({
    type: String,
    enum: ['project_admin', 'design_lead', 'designer', 'developer', 'viewer'],
    required: true,
  })
  role: ProjectRole;
  @Prop(nowProp) createdAt: Date;
}
export const MemberSchema = SchemaFactory.createForClass(MemberDoc);
MemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
