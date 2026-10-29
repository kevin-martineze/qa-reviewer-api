import type { AuditEvent, Invitation, Organization, User } from '../src/shared/contract';
import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { OutboxDoc } from '../src/shared/schemas';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('GET /organization y /users', () => {
  it('pide sesión', async () => {
    const res = await t.call('GET', '/users');
    expect(res.status).toBe(401);
    expect(res.body.messageKey).toBe('auth.required');
  });

  it('devuelve la organización envuelta en data', async () => {
    const res = await t.call<Organization>('GET', '/organization', await t.login(DEMO.kevin));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'pangea', name: 'Pangea' });
  });

  it('lista a todas las personas con la forma del contrato', async () => {
    const res = await t.call<User[]>('GET', '/users', await t.login(DEMO.kevin));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(8);
    const kevin = res.body.data?.find((u) => u.id === 'u1');
    expect(Object.keys(kevin ?? {}).sort()).toEqual(
      ['avatar', 'createdAt', 'email', 'id', 'lastSeenAt', 'name', 'orgRole', 'status'].sort(),
    );
  });
});

describe('PATCH /users/:id', () => {
  it('exige users:invite', async () => {
    const res = await t.call('PATCH', '/users/u3', await t.login(DEMO.kevin), {
      status: 'inactive',
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'users:invite' });
  });

  it('acepta exactamente uno de status u orgRole', async () => {
    const token = await t.login(DEMO.laura);
    const both = await t.call('PATCH', '/users/u3', token, { status: 'active', orgRole: 'admin' });
    expect(both.status).toBe(400);
    expect(both.body.messageKey).toBe('common.validation');
    const none = await t.call('PATCH', '/users/u3', token, {});
    expect(none.status).toBe(400);
  });

  it('no deja tocarse a uno mismo ni desactivar al owner', async () => {
    const token = await t.login(DEMO.laura);
    const self = await t.call('PATCH', '/users/u2', token, { status: 'inactive' });
    expect([self.status, self.body.messageKey]).toEqual([409, 'users.self']);
    const owner = await t.call('PATCH', '/users/u7', token, { status: 'inactive' });
    expect([owner.status, owner.body.messageKey]).toEqual([409, 'users.owner']);
  });

  it('solo el owner da o quita el rol owner', async () => {
    const token = await t.login(DEMO.laura);
    const promote = await t.call('PATCH', '/users/u3', token, { orgRole: 'owner' });
    expect(promote.status).toBe(403);
    expect(promote.body.details).toEqual({ permission: 'org:manage' });
    const demote = await t.call('PATCH', '/users/u7', token, { orgRole: 'member' });
    expect(demote.status).toBe(403);
    expect(demote.body.details).toEqual({ permission: 'org:manage' });
  });

  it('responde 404 si la persona no existe', async () => {
    const res = await t.call('PATCH', '/users/nadie', await t.login(DEMO.laura), {
      status: 'inactive',
    });
    expect([res.status, res.body.messageKey]).toEqual([404, 'users.not_found']);
  });

  it('desactivar cierra sus sesiones; reactivar la devuelve', async () => {
    const admin = await t.login(DEMO.laura);
    const mateo = await t.login('mateo.cardenas@ejemplo.co');

    const off = await t.call<User>('PATCH', '/users/u5', admin, { status: 'inactive' });
    expect(off.status).toBe(200);
    expect(off.body.data?.status).toBe('inactive');
    expect((await t.call('GET', '/me', mateo)).status).toBe(401);

    const on = await t.call<User>('PATCH', '/users/u5', admin, { status: 'active' });
    expect(on.body.data?.status).toBe('active');
  });

  it('cambia el rol y lo deja en la auditoría', async () => {
    const admin = await t.login(DEMO.laura);
    const res = await t.call<User>('PATCH', '/users/u6', admin, { orgRole: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data?.orgRole).toBe('admin');

    const audit = await t.call<{ items: AuditEvent[] }>(
      'GET',
      '/audit?type=role_changed&actor=u2',
      admin,
    );
    expect(audit.body.data?.items[0]).toMatchObject({
      type: 'role_changed',
      actor: 'u2',
      target: 'u6',
    });
  });
});

describe('Invitaciones', () => {
  it('listar exige users:invite', async () => {
    const res = await t.call('GET', '/invitations', await t.login(DEMO.kevin));
    expect(res.status).toBe(403);
  });

  it('lista con el estado calculado', async () => {
    const res = await t.call<Invitation[]>('GET', '/invitations', await t.login(DEMO.laura));
    expect(res.status).toBe(200);
    const byEmail = new Map(res.body.data?.map((i) => [i.email, i.status]));
    expect(byEmail.get('mariana@ejemplo.co')).toBe('valid');
    expect(byEmail.get('luis@ejemplo.co')).toBe('expired');
    expect(byEmail.get('caro@ejemplo.co')).toBe('used');
    expect(byEmail.get('pablo@ejemplo.co')).toBe('revoked');
  });

  it('rechaza correos con cuenta o con invitación vigente', async () => {
    const token = await t.login(DEMO.laura);
    const user = await t.call('POST', '/invitations', token, {
      email: 'KEVIN@ejemplo.co',
      role: 'member',
      projects: [],
    });
    expect([user.status, user.body.messageKey]).toEqual([409, 'users.exists']);
    const pending = await t.call('POST', '/invitations', token, {
      email: 'mariana@ejemplo.co',
      role: 'member',
      projects: [],
    });
    expect([pending.status, pending.body.messageKey]).toEqual([409, 'invite.pending']);
  });

  it('invitar como owner exige org:manage', async () => {
    const res = await t.call('POST', '/invitations', await t.login(DEMO.laura), {
      email: 'jefa@ejemplo.co',
      role: 'owner',
      projects: [],
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'org:manage' });
  });

  it('rechaza proyectos que no existen', async () => {
    const res = await t.call('POST', '/invitations', await t.login(DEMO.laura), {
      email: 'otra@ejemplo.co',
      role: 'member',
      projects: [{ projectId: 'fantasma', role: 'viewer' }],
    });
    expect([res.status, res.body.messageKey]).toEqual([400, 'invite.invalid_projects']);
  });

  it('crea la invitación, publica el correo y el enlace funciona', async () => {
    const res = await t.call<Invitation>('POST', '/invitations', await t.login(DEMO.laura), {
      email: 'Nueva@Ejemplo.co',
      role: 'member',
      projects: [{ projectId: 'lideris', role: 'designer' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'nueva@ejemplo.co',
      role: 'member',
      projects: [{ projectId: 'lideris', role: 'designer' }],
      invitedBy: 'u2',
      status: 'valid',
    });

    const outbox = t.app.get<Model<OutboxDoc>>(getModelToken(OutboxDoc.name));
    const event = await outbox.findOne({ type: 'InvitationCreated' }).lean();
    const url = String(event?.payload.url);
    expect(url).toMatch(/\/invite\/[\w-]+$/);
    const token = url.split('/').pop() ?? '';
    const info = await t.call<{ status: string; projects: string[] }>(
      'GET',
      `/invitations/${token}`,
    );
    expect(info.body.data).toMatchObject({ status: 'valid', projects: ['Lideris'] });
  });

  it('una invitación vencida no bloquea invitar de nuevo', async () => {
    const res = await t.call('POST', '/invitations', await t.login(DEMO.laura), {
      email: 'luis@ejemplo.co',
      role: 'member',
      projects: [],
    });
    expect(res.status).toBe(201);
  });

  it('revoca con 204 y responde 404 si no existe', async () => {
    const token = await t.login(DEMO.laura);
    const list = await t.call<Invitation[]>('GET', '/invitations', token);
    const mariana = list.body.data?.find((i) => i.email === 'mariana@ejemplo.co');
    const res = await t.call('DELETE', `/invitations/${mariana?.id}`, token);
    expect(res.status).toBe(204);

    const after = await t.call<Invitation[]>('GET', '/invitations', token);
    expect(after.body.data?.find((i) => i.id === mariana?.id)?.status).toBe('revoked');

    const missing = await t.call('DELETE', '/invitations/nada', token);
    expect([missing.status, missing.body.messageKey]).toEqual([404, 'invite.not_found']);
  });
});

describe('GET /audit', () => {
  it('exige users:invite', async () => {
    const res = await t.call('GET', '/audit', await t.login(DEMO.kevin));
    expect(res.status).toBe(403);
  });

  it('pagina, más reciente primero', async () => {
    const res = await t.call<{ items: AuditEvent[]; pagination: object }>(
      'GET',
      '/audit?page=1&limit=2',
      await t.login(DEMO.laura),
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.items).toHaveLength(2);
    const [first, second] = res.body.data?.items ?? [];
    expect(Date.parse(first?.createdAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(second?.createdAt ?? ''),
    );
    expect(res.body.data?.pagination).toMatchObject({ page: 1, limit: 2 });
  });

  it('filtra por tipo y rechaza tipos desconocidos', async () => {
    const token = await t.login(DEMO.laura);
    const invited = await t.call<{ items: AuditEvent[] }>('GET', '/audit?type=user_invited', token);
    expect(invited.body.data?.items.length).toBeGreaterThan(0);
    expect(invited.body.data?.items.every((e) => e.type === 'user_invited')).toBe(true);

    const bad = await t.call('GET', '/audit?type=otro', token);
    expect(bad.status).toBe(400);
  });
});
