import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { BootstrapRefused, bootstrapOrganization } from '../src/bootstrap/bootstrap';
import { OrganizationDoc, RecoveryDoc, UserDoc } from '../src/shared/schemas';
import { sha256 } from '../src/shared/util/ids';

import { startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

const INPUT = {
  org: 'Mi Organización',
  orgId: 'mi-organizacion',
  owner: 'owner@ejemplo.co',
  name: 'Persona Owner',
};

describe('bootstrap', () => {
  it('no toca una base con datos', async () => {
    await expect(bootstrapOrganization(t.app, INPUT)).rejects.toBeInstanceOf(BootstrapRefused);
  });

  it('en una base vacía crea la organización, el owner y un enlace para la contraseña', async () => {
    const orgs = t.app.get<Model<OrganizationDoc>>(getModelToken(OrganizationDoc.name));
    const users = t.app.get<Model<UserDoc>>(getModelToken(UserDoc.name));
    const recoveries = t.app.get<Model<RecoveryDoc>>(getModelToken(RecoveryDoc.name));
    await Promise.all([orgs.deleteMany({}), users.deleteMany({})]);

    const result = await bootstrapOrganization(t.app, INPUT);
    expect(result.url).toMatch(/^http:\/\/localhost:5173\/recover\/[\w-]{43}$/);
    expect(await orgs.findById('mi-organizacion').lean()).toMatchObject({
      name: 'Mi Organización',
    });
    expect(await users.findById(result.userId).lean()).toMatchObject({
      email: 'owner@ejemplo.co',
      orgRole: 'owner',
      status: 'active',
    });
    // El token solo se guarda como SHA-256.
    const token = result.url.split('/').pop() ?? '';
    expect(await recoveries.exists({ tokenHash: sha256(token) })).toBeTruthy();
    expect(await recoveries.exists({ tokenHash: token })).toBeNull();

    const reset = await t.call('POST', `/auth/recovery/${token}`, undefined, {
      password: 'una-clave-larga',
    });
    expect(reset.status).toBe(204);
    const login = await t.call<{ token: string }>('POST', '/auth/login', undefined, {
      email: 'owner@ejemplo.co',
      password: 'una-clave-larga',
    });
    expect(login.status).toBe(200);
    const org = await t.call('GET', '/organization', login.body.data?.token);
    expect(org.body).toMatchObject({ data: { id: 'mi-organizacion', name: 'Mi Organización' } });

    await expect(bootstrapOrganization(t.app, INPUT)).rejects.toBeInstanceOf(BootstrapRefused);
  });
});
