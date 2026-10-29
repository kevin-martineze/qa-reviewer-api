import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';

import type { ActivityType, AuditType } from '../contract';
import { ActivityDoc, AuditDoc } from '../schemas';
import { ClockService } from '../util/clock.service';

/** Línea de tiempo de cada revisión. El texto va listo para leer («asignó la revisión a…»). */
@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(ActivityDoc.name) private readonly activity: Model<ActivityDoc>,
    private readonly clock: ClockService,
  ) {}

  async log(
    type: ActivityType,
    actor: string,
    review: string,
    text: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.activity.create([{ type, actor, review, text, createdAt: this.clock.now() }], {
      session,
    });
  }
}

/** Registro de la organización: invitaciones, roles, miembros, tokens y proyectos. */
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditDoc.name) private readonly audit: Model<AuditDoc>,
    private readonly clock: ClockService,
  ) {}

  async log(type: AuditType, actor: string, target: string, text: string): Promise<void> {
    await this.audit.create({ type, actor, target, text, createdAt: this.clock.now() });
  }
}
