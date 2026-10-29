import type { SessionUser } from '../contract';
import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { MemberDoc, UserDoc } from '../schemas';

@Injectable()
export class SessionUserService {
  constructor(
    @InjectModel(UserDoc.name) private readonly users: Model<UserDoc>,
    @InjectModel(MemberDoc.name) private readonly members: Model<MemberDoc>,
  ) {}

  /** Usuario activo con sus membresías, o `null`. */
  async load(userId: string): Promise<SessionUser | null> {
    const user = await this.users.findById(userId).lean();
    if (!user || user.status !== 'active') return null;
    return this.toSessionUser(user);
  }

  async toSessionUser(user: UserDoc): Promise<SessionUser> {
    const memberships = await this.members.find({ userId: user._id }).lean();
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      orgRole: user.orgRole,
      status: user.status,
      avatar: user.avatar,
      memberships: memberships.map((m) => ({ projectId: m.projectId, role: m.role })),
    };
  }
}
