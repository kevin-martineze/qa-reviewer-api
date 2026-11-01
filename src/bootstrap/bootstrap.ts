// Primer arranque en producción: crea la organización y su owner en una base vacía y
// devuelve un enlace de un solo uso para que el owner defina su contraseña.
import type { BootstrapInput } from './domain';
import type { Env } from '../config/env';
import type { INestApplicationContext } from '@nestjs/common';
import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { ENV } from '../config/env';
import { OrganizationDoc, RecoveryDoc, UserDoc } from '../shared/schemas';
import { ClockService } from '../shared/util/clock.service';
import { newId, randomToken, sha256 } from '../shared/util/ids';
import { TransactionService } from '../shared/util/transaction.service';

import { BOOTSTRAP_LINK_HOURS } from './domain';

export interface BootstrapResult {
  orgId: string;
  userId: string;
  email: string;
  /** `<PUBLIC_WEB_URL>/recover/<token>`: el token no se guarda, solo su SHA-256. */
  url: string;
  expiresAt: Date;
}

export class BootstrapRefused extends Error {}

export async function bootstrapOrganization(
  app: INestApplicationContext,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const orgs = app.get<Model<OrganizationDoc>>(getModelToken(OrganizationDoc.name));
  const users = app.get<Model<UserDoc>>(getModelToken(UserDoc.name));
  const recoveries = app.get<Model<RecoveryDoc>>(getModelToken(RecoveryDoc.name));
  const tx = app.get(TransactionService);
  const clock = app.get(ClockService);
  const env = app.get<Env>(ENV);

  const [orgCount, userCount] = await Promise.all([orgs.countDocuments(), users.countDocuments()]);
  if (orgCount > 0 || userCount > 0) {
    throw new BootstrapRefused(
      `La base ya tiene datos (${orgCount} organizaciones, ${userCount} personas): bootstrap solo corre en una base vacía.`,
    );
  }

  const now = clock.now();
  const userId = newId();
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + BOOTSTRAP_LINK_HOURS * 3_600_000);

  await tx.run(async (session) => {
    await orgs.create([{ _id: input.orgId, name: input.org, createdAt: now }], { session });
    await users.create(
      [
        {
          _id: userId,
          name: input.name,
          email: input.owner,
          orgRole: 'owner',
          status: 'active',
          createdAt: now,
        },
      ],
      { session },
    );
    await recoveries.create([{ tokenHash: sha256(token), userId, createdAt: now, expiresAt }], {
      session,
    });
  });

  const web = env.PUBLIC_WEB_URL.replace(/\/$/, '');
  return {
    orgId: input.orgId,
    userId,
    email: input.owner,
    url: `${web}/recover/${token}`,
    expiresAt,
  };
}
