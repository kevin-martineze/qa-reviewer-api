import type { Principal } from '../../shared/auth/principal';
import type { Project, ProjectIntegrations, SessionUser } from '../../shared/contract';
import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { AccessService } from '../../shared/auth/access.service';
import { can, isOrgAdmin } from '../../shared/auth/permissions';
import { AuditService } from '../../shared/events/activity.service';
import { badRequest, conflict, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toProject } from '../../shared/mappers';
import {
  DEFAULT_INTEGRATIONS,
  DEFAULT_LIMITS,
  MemberDoc,
  ProjectDoc,
  ReviewDoc,
} from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { isDuplicateKey } from '../../shared/util/mongo-errors';
import { TransactionService } from '../../shared/util/transaction.service';

import { strangersIn } from './domain/module-rules';

export interface NewProject {
  id: string;
  name: string;
  repo: string;
  planeKey: string;
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    | 'name'
    | 'slaDays'
    | 'strategy'
    | 'moduleRules'
    | 'integrations'
    | 'maskSelectors'
    | 'designRules'
  >
>;

/** Borradores y vencidas no se ven en la web: tampoco cuentan. */
const VISIBLE_STATUSES = ['open', 'in_review', 'changes_requested', 'approved', 'closed'];

export const PROJECT_NOT_FOUND = () => notFound('projects.not_found', 'Proyecto no encontrado.');

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(ProjectDoc.name) private readonly projects: Model<ProjectDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(ReviewDoc.name) private readonly reviews: Model<ReviewDoc>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  /** El proyecto si la persona puede leerlo; si no, «no existe» (404), exista o no. */
  async findVisible(user: SessionUser, projectId: string): Promise<ProjectDoc> {
    if (!can(user, 'reviews:read', projectId)) throw PROJECT_NOT_FOUND();
    const project = await this.projects.findById(projectId).lean();
    if (!project) throw PROJECT_NOT_FOUND();
    return project;
  }

  async list(principal: Principal): Promise<Envelope<Project[]>> {
    const user = principal.user;
    const filter = isOrgAdmin(user)
      ? {}
      : { _id: { $in: user.memberships.map((m) => m.projectId) } };
    const docs = await this.projects.find(filter).sort({ name: 1, _id: 1 }).lean();
    const counts = await this.countReviews(docs.map((d) => d._id));
    return envelope(
      'projects.list',
      docs.map((d) => toProject(d, counts.get(d._id) ?? 0)),
    );
  }

  async get(principal: Principal, projectId: string): Promise<Envelope<Project>> {
    const project = await this.findVisible(principal.user, projectId);
    const counts = await this.countReviews([project._id]);
    return envelope('projects.get', toProject(project, counts.get(project._id) ?? 0));
  }

  async create(principal: Principal, input: NewProject): Promise<Envelope<Project>> {
    const actor = principal.user;
    this.access.assert(actor, 'projects:create', null);
    const integrations: ProjectIntegrations = structuredClone(DEFAULT_INTEGRATIONS);
    integrations.github.repo = input.repo;
    integrations.plane.projectKey = input.planeKey;
    try {
      const doc = await this.tx.run(async (session) => {
        const [created] = await this.projects.create(
          [
            {
              _id: input.id,
              name: input.name,
              repo: input.repo,
              planeKey: input.planeKey,
              integrations,
              limits: { ...DEFAULT_LIMITS },
              createdAt: this.clock.now(),
            },
          ],
          { session },
        );
        if (!created) throw new Error('No se creó el proyecto');
        await this.audit.log(
          'project_created',
          actor.id,
          created._id,
          `creó el proyecto ${created.name}`,
          session,
        );
        return created.toObject();
      });
      return envelope('projects.created', toProject(doc, 0));
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw conflict('projects.exists', 'Ya hay un proyecto con ese identificador.');
      }
      throw error;
    }
  }

  async update(
    principal: Principal,
    projectId: string,
    patch: ProjectPatch,
  ): Promise<Envelope<Project>> {
    const actor = principal.user;
    const project = await this.findVisible(actor, projectId);
    this.access.assert(actor, 'projects:configure', project._id);

    if (patch.moduleRules?.length) {
      const members = await this.members.find({ projectId: project._id }, { userId: 1 }).lean();
      const strangers = strangersIn(
        patch.moduleRules,
        members.map((m) => m.userId),
      );
      if (strangers.length) {
        throw badRequest(
          'projects.invalid_rules',
          'Las reglas por módulo solo pueden asignar a miembros del proyecto.',
          { userIds: strangers },
        );
      }
    }

    const updated = await this.tx.run(async (session) => {
      const doc = await this.projects
        .findByIdAndUpdate(project._id, { $set: patch }, { new: true, session })
        .lean();
      if (!doc) throw PROJECT_NOT_FOUND();
      await this.audit.log(
        'project_updated',
        actor.id,
        doc._id,
        `actualizó la configuración de ${doc.name}`,
        session,
      );
      return doc;
    });
    const counts = await this.countReviews([updated._id]);
    return envelope('projects.updated', toProject(updated, counts.get(updated._id) ?? 0));
  }

  private async countReviews(projectIds: string[]): Promise<Map<string, number>> {
    if (!projectIds.length) return new Map();
    const rows = await this.reviews.aggregate<{ _id: string; n: number }>([
      { $match: { projectId: { $in: projectIds }, status: { $in: VISIBLE_STATUSES } } },
      { $group: { _id: '$projectId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.n]));
  }
}
