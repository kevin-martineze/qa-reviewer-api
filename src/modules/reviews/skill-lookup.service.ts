import type { Principal } from '../../shared/auth/principal';
import type { SkillProject, SkillReviewRef } from '../../shared/contract';
import type { Model } from 'mongoose';

import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { ENV, type Env } from '../../config/env';
import { can } from '../../shared/auth/permissions';
import { badRequest, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { ProjectDoc, ReviewDoc } from '../../shared/schemas';

import { REVIEW_NOT_FOUND } from './reviews.service';

/**
 * Lo que la skill consulta antes de capturar y para `status`. Solo con token `qa_pat_`: el
 * proyecto es el del token.
 */
@Injectable()
export class SkillLookupService {
  constructor(
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @InjectModel(ReviewDoc.name) private readonly reviews: Model<ReviewDoc>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async project(principal: Principal): Promise<Envelope<SkillProject>> {
    const projectId = this.tokenProject(principal);
    const project = can(principal.user, 'reviews:read', projectId)
      ? await this.projects.findById(projectId).lean()
      : null;
    if (!project) throw notFound('projects.not_found', 'Proyecto no encontrado.');
    const { limits } = project;
    return envelope('skill.project', {
      id: project._id,
      name: project.name,
      maskSelectors: project.maskSelectors,
      designRules: project.designRules,
      limits: {
        maxScreens: limits.maxScreens,
        maxBytes: limits.maxBytes,
        contentTypes: limits.contentTypes,
        viewport: { min: limits.viewportMin, max: limits.viewportMax },
      },
      minSkillVersion: this.env.MIN_SKILL_VERSION,
    });
  }

  /** La revisión más reciente del PR en el proyecto del token: sin vencidas ni borradores ajenos. */
  async byPr(principal: Principal, pr: number): Promise<Envelope<SkillReviewRef>> {
    const projectId = this.tokenProject(principal);
    if (!can(principal.user, 'reviews:read', projectId)) throw REVIEW_NOT_FOUND();
    const doc = await this.reviews
      .findOne(
        {
          projectId,
          'pr.number': pr,
          $or: [
            { status: { $nin: ['draft', 'expired'] } },
            { status: 'draft', author: principal.user.id },
          ],
        },
        { status: 1, round: 1 },
      )
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    if (!doc || doc.status === 'expired') throw REVIEW_NOT_FOUND();
    return envelope('skill.review', {
      id: doc._id,
      status: doc.status,
      round: doc.round,
      url: `${this.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/reviews/${doc._id}`,
    });
  }

  private tokenProject(principal: Principal): string {
    if (principal.kind !== 'token') {
      throw badRequest(
        'skill.token_required',
        'Este endpoint es de la skill: llámalo con un token qa_pat_.',
      );
    }
    return principal.projectId;
  }
}
