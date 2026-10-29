import type { Principal } from '../../shared/auth/principal';
import type { ProjectMember, ProjectRole } from '../../shared/contract';
import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { AccessService } from '../../shared/auth/access.service';
import { AuditService } from '../../shared/events/activity.service';
import { conflict, notFound } from '../../shared/http/api-error';
import { envelope, type Envelope } from '../../shared/http/envelope';
import { toMember } from '../../shared/mappers';
import { MemberDoc, ProjectDoc, UserDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { isDuplicateKey } from '../../shared/util/mongo-errors';
import { TransactionService } from '../../shared/util/transaction.service';

import { ProjectsService } from './projects.service';

const MEMBER_NOT_FOUND = () => notFound('members.not_found', 'No es miembro del proyecto.');
const MEMBER_EXISTS = () => conflict('members.exists', 'Ya es miembro del proyecto.');

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
    @InjectModel(ProjectDoc.name) private readonly projectModel: Model<ProjectDoc>,
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    private readonly projects: ProjectsService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
    private readonly clock: ClockService,
  ) {}

  async list(principal: Principal, projectId: string): Promise<Envelope<ProjectMember[]>> {
    const project = await this.projects.findVisible(principal.user, projectId);
    const docs = await this.members
      .find({ projectId: project._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    return envelope('members.list', docs.map(toMember));
  }

  async add(
    principal: Principal,
    projectId: string,
    input: { userId: string; role: ProjectRole },
  ): Promise<Envelope<ProjectMember>> {
    const actor = principal.user;
    const project = await this.projects.findVisible(actor, projectId);
    this.access.assert(actor, 'members:manage', project._id);

    const user = await this.users.findById(input.userId, { name: 1, status: 1 }).lean();
    if (!user) throw notFound('users.not_found', 'Usuario no encontrado.');
    if (user.status !== 'active') {
      throw conflict(
        'users.inactive',
        'La cuenta está desactivada: reactívala antes de agregarla.',
      );
    }
    if (await this.members.exists({ projectId: project._id, userId: user._id })) {
      throw MEMBER_EXISTS();
    }

    try {
      const member = await this.tx.run(async (session) => {
        const [doc] = await this.members.create(
          [
            {
              projectId: project._id,
              userId: user._id,
              role: input.role,
              createdAt: this.clock.now(),
            },
          ],
          { session },
        );
        if (!doc) throw new Error('No se creó la membresía');
        await this.audit.log(
          'member_added',
          actor.id,
          user._id,
          `agregó a ${user.name} a ${project.name}`,
          session,
        );
        return doc.toObject();
      });
      return envelope('members.added', toMember(member));
    } catch (error) {
      if (isDuplicateKey(error)) throw MEMBER_EXISTS();
      throw error;
    }
  }

  async setRole(
    principal: Principal,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<Envelope<ProjectMember>> {
    const actor = principal.user;
    const project = await this.projects.findVisible(actor, projectId);
    this.access.assert(actor, 'members:manage', project._id);

    const current = await this.members.findOne({ projectId: project._id, userId }).lean();
    if (!current) throw MEMBER_NOT_FOUND();
    if (current.role === role) return envelope('members.updated', toMember(current));

    const member = await this.tx.run(async (session) => {
      const doc = await this.members
        .findOneAndUpdate({ projectId: project._id, userId }, { role }, { new: true, session })
        .lean();
      if (!doc) throw MEMBER_NOT_FOUND();
      const name = await this.nameOf(userId);
      await this.audit.log(
        'role_changed',
        actor.id,
        userId,
        `cambió el rol de ${name} en ${project.name} a ${role}`,
        session,
      );
      return doc;
    });
    return envelope('members.updated', toMember(member));
  }

  async remove(principal: Principal, projectId: string, userId: string): Promise<void> {
    const actor = principal.user;
    const project = await this.projects.findVisible(actor, projectId);
    this.access.assert(actor, 'members:manage', project._id);
    if (userId === actor.id) throw conflict('members.self', 'No puedes quitarte a ti mismo.');

    await this.tx.run(async (session) => {
      const removed = await this.members.deleteOne({ projectId: project._id, userId }, { session });
      if (removed.deletedCount !== 1) throw MEMBER_NOT_FOUND();
      // Sus reglas por módulo dejan de servir: la asignación no puede caer en quien ya no está.
      await this.projectModel.updateOne(
        { _id: project._id },
        { $pull: { moduleRules: { userId } } },
        { session },
      );
      const name = await this.nameOf(userId);
      await this.audit.log(
        'member_removed',
        actor.id,
        userId,
        `quitó a ${name} de ${project.name}`,
        session,
      );
    });
  }

  private async nameOf(userId: string): Promise<string> {
    const user = await this.users.findById(userId, { name: 1 }).lean();
    return user?.name ?? userId;
  }
}
