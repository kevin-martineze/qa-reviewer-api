import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import type {
  Box,
  Priority,
  ReviewSummary,
  ScreenElement,
  Verdict,
} from '../contract';

import { nowProp } from './common';

/** Estados guardados: los del contrato más `expired` (borrador que nunca se publicó). */
export type StoredReviewStatus =
  | 'draft'
  | 'open'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'closed'
  | 'expired';

export interface StoredCapture {
  /** Clave del objeto en el storage. */
  key: string;
  contentType: string;
  bytes: number;
  sha256: string;
}

export interface StoredScreen {
  key: string;
  title: string;
  lead: string;
  route: string;
  viewport: { width: number; height: number };
  after: StoredCapture | null;
  before: StoredCapture | null;
  /** Captura de la ronda anterior, si la pantalla cambió en esta ronda. */
  previous: StoredCapture | null;
  changedIn: number;
  inherited: boolean;
  roundNote: string | null;
  diff: Box[];
  elements: ScreenElement[];
  changes: string[];
  questions: string[];
  verdict: Verdict;
}

export interface StoredSubmission {
  by: string;
  createdAt: Date;
  result: 'approved' | 'changes_requested';
  approved: number;
  changes: number;
  body: string | null;
}

export interface StoredRound {
  n: number;
  by: string;
  createdAt: Date;
  note: string | null;
  changed: string[];
  verdicts: Record<string, Verdict>;
  submission: StoredSubmission | null;
}

export interface PendingUpload {
  screenKey: string;
  kind: 'after' | 'before';
  capture: StoredCapture;
}

/** Ronda subida por la skill que espera `publish` (la primera o una nueva). */
export interface PendingRound {
  n: number;
  by: string;
  createdAt: Date;
  note: string | null;
  title: string;
  context: string;
  module: string;
  card: { key: string; title: string };
  pr: StoredPullRequest;
  summary: ReviewSummary;
  notCaptured: string[];
  /** Pantallas ya armadas (las heredadas copian su captura); el veredicto se decide al publicar. */
  screens: StoredScreen[];
  changed: string[];
  uploads: PendingUpload[];
}

export interface StoredPullRequest {
  number: number;
  url: string;
  title: string;
  base: string;
  head: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  check: 'pending' | 'success' | 'failure' | null;
  commit: string;
}

@Schema({ collection: 'qa_reviews', versionKey: false, minimize: false })
export class ReviewDoc {
  /** `QR-0001` (ADR 0010). */
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true, index: true }) projectId: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) context: string;
  @Prop({ type: Object, required: true }) card: { key: string; title: string };
  @Prop({ type: Object, required: true }) pr: StoredPullRequest;
  @Prop({ default: '' }) module: string;
  @Prop({ required: true, index: true }) author: string;
  @Prop({ type: [String], default: [] }) assignees: string[];
  @Prop({ type: String, required: true, index: true }) status: StoredReviewStatus;
  @Prop({ default: 0 }) round: number;
  @Prop({ type: String, enum: ['urgent', 'high', 'medium', 'low'], default: 'medium' })
  priority: Priority;
  @Prop({ type: Date, default: null }) dueAt: Date | null;
  @Prop({ type: Object, default: () => ({ steps: [], rules: [] }) }) summary: ReviewSummary;
  @Prop({ type: [String], default: [] }) notCaptured: string[];
  @Prop({ type: [Object], default: [] }) screens: StoredScreen[];
  @Prop({ type: [Object], default: [] }) rounds: StoredRound[];
  @Prop({ type: Object, default: null }) pending: PendingRound | null;
  @Prop({ type: Object, default: null }) privacy: { masked: boolean; dataset: string } | null;
  @Prop({ type: Object, default: null }) generator: { name: string; version: string } | null;
  @Prop(nowProp) createdAt: Date;
  @Prop({ ...nowProp, index: true }) updatedAt: Date;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
  @Prop({ type: Date, default: null }) closedAt: Date | null;
  @Prop({ type: Date, default: null }) dueSoonNotifiedAt: Date | null;
  @Prop({ type: Date, default: null }) overdueNotifiedAt: Date | null;
  @Prop({ type: Date, default: null }) assetsPurgedAt: Date | null;
}
export const ReviewSchema = SchemaFactory.createForClass(ReviewDoc);
// Una revisión activa por PR (las cerradas y vencidas no cuentan).
ReviewSchema.index(
  { projectId: 1, 'pr.number': 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['draft', 'open', 'in_review', 'changes_requested', 'approved'] },
    },
  },
);

@Schema({ collection: 'qa_counters', versionKey: false })
export class CounterDoc {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ default: 0 }) seq: number;
}
export const CounterSchema = SchemaFactory.createForClass(CounterDoc);
