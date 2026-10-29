import type { MetricReview } from './domain/metrics';
import type { Principal } from '../../shared/auth/principal';
import type { ReportsOverview } from '../../shared/contract';
import type { FilterQuery, Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { AccessService } from '../../shared/auth/access.service';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { ReviewDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { ProjectsService } from '../projects/projects.service';
import { PUBLISHED_STATUSES } from '../reviews/domain/review-state';

import { overview } from './domain/metrics';

export interface ReportsQuery {
  project?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(ReviewDoc.name) private readonly reviews: Model<ReviewDoc>,
    private readonly projects: ProjectsService,
    private readonly access: AccessService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Con `project`, exige `reports:view` en ese proyecto (si no lo ve, 404). Sin proyecto, el
   * permiso a nivel de organización (owner y admin) y todas las revisiones.
   */
  async overview(principal: Principal, query: ReportsQuery): Promise<Envelope<ReportsOverview>> {
    const user = principal.user;
    const filter: FilterQuery<ReviewDoc> = { status: { $in: PUBLISHED_STATUSES } };
    if (query.project) {
      const project = await this.projects.findVisible(user, query.project);
      this.access.assert(user, 'reports:view', project._id);
      filter.projectId = project._id;
    } else {
      this.access.assert(user, 'reports:view', null);
    }
    if (query.from || query.to) {
      filter.publishedAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }

    const docs = await this.reviews
      .find(filter, {
        status: 1,
        round: 1,
        module: 1,
        assignees: 1,
        'screens.key': 1,
        publishedAt: 1,
        createdAt: 1,
        dueAt: 1,
        'rounds.n': 1,
        'rounds.verdicts': 1,
        'rounds.submission.createdAt': 1,
        'rounds.submission.result': 1,
      })
      .lean();
    const rows: MetricReview[] = docs.map((r) => ({
      status: r.status,
      round: r.round,
      module: r.module,
      assignees: r.assignees,
      screens: r.screens.length,
      openedAt: r.publishedAt ?? r.createdAt,
      dueAt: r.dueAt,
      rounds: r.rounds.map((x) => ({
        n: x.n,
        verdicts: x.verdicts,
        submission: x.submission
          ? { createdAt: x.submission.createdAt, result: x.submission.result }
          : null,
      })),
    }));
    return envelope('reports.overview', overview(rows, this.clock.now()));
  }
}
