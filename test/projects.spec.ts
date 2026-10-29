import type { Project, ProjectMember } from '../src/shared/contract';

import { buildOpenApi } from '../src/shared/docs/swagger';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('GET /projects', () => {
  it('muestra solo los proyectos donde la persona es miembro', async () => {
    const res = await t.call<Project[]>('GET', '/projects', await t.login(DEMO.sofia));
    expect(res.status).toBe(200);
    expect(res.body.data?.map((p) => p.id)).toEqual(['lideris']);
    expect(res.body.data?.[0]?.reviewsCount).toBeGreaterThan(0);
  });

  it('owner y admin ven todos', async () => {
    const res = await t.call<Project[]>('GET', '/projects', await t.login(DEMO.laura));
    expect(res.body.data?.map((p) => p.id).sort()).toEqual(['auralis', 'lideris']);
  });
});

describe('GET /projects/:id', () => {
  it('responde 404 si no lo ve, aunque exista', async () => {
    const res = await t.call('GET', '/projects/auralis', await t.login(DEMO.sofia));
    expect([res.status, res.body.messageKey]).toEqual([404, 'projects.not_found']);
  });

  it('responde 404 si no existe', async () => {
    const res = await t.call('GET', '/projects/nada', await t.login(DEMO.valentina));
    expect(res.status).toBe(404);
  });

  it('devuelve el proyecto con la forma del contrato', async () => {
    const res = await t.call<Project>('GET', '/projects/lideris', await t.login(DEMO.sofia));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'lideris', name: 'Lideris', strategy: 'by_module' });
    expect(res.body.data?.integrations.github.checkName).toBe('design-review');
  });
});

describe('POST /projects', () => {
  it('exige projects:create', async () => {
    const res = await t.call('POST', '/projects', await t.login(DEMO.kevin), {
      id: 'portal',
      name: 'Portal',
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'projects:create' });
  });

  it('valida el slug', async () => {
    const res = await t.call('POST', '/projects', await t.login(DEMO.laura), {
      id: 'Mal Slug',
      name: 'Portal',
    });
    expect([res.status, res.body.messageKey]).toEqual([400, 'common.validation']);
  });

  it('crea con valores por defecto y no repite el id', async () => {
    const token = await t.login(DEMO.laura);
    const res = await t.call<Project>('POST', '/projects', token, {
      id: 'portal-web',
      name: 'Portal web',
      repo: 'acme/portal',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 'portal-web',
      repo: 'acme/portal',
      slaDays: 2,
      strategy: 'manual',
      moduleRules: [],
      reviewsCount: 0,
    });
    expect(res.body.data?.integrations.github).toMatchObject({
      connected: false,
      repo: 'acme/portal',
    });

    const audit = await t.call<{ items: Array<{ actor: string; target: string; text: string }> }>(
      'GET',
      '/audit?type=project_created',
      token,
    );
    expect(audit.body.data?.items[0]).toMatchObject({
      actor: 'u2',
      target: 'portal-web',
      text: 'creó el proyecto Portal web',
    });

    const again = await t.call('POST', '/projects', token, { id: 'portal-web', name: 'Otro' });
    expect([again.status, again.body.messageKey]).toEqual([409, 'projects.exists']);
  });
});

describe('PATCH /projects/:id', () => {
  it('exige projects:configure en el proyecto', async () => {
    const res = await t.call('PATCH', '/projects/lideris', await t.login(DEMO.andres), {
      slaDays: 3,
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'projects:configure' });
  });

  it('responde 404 a quien no ve el proyecto', async () => {
    const res = await t.call('PATCH', '/projects/auralis', await t.login(DEMO.sofia), {
      slaDays: 3,
    });
    expect(res.status).toBe(404);
  });

  it('rechaza un patch vacío y reglas hacia no miembros', async () => {
    const token = await t.login(DEMO.kevin);
    const empty = await t.call('PATCH', '/projects/auralis', token, {});
    expect(empty.status).toBe(400);
    const stranger = await t.call('PATCH', '/projects/auralis', token, {
      moduleRules: [{ pattern: '/x/*', userId: 'u4' }],
    });
    expect([stranger.status, stranger.body.messageKey]).toEqual([400, 'projects.invalid_rules']);
  });

  it('aplica el patch parcial', async () => {
    const res = await t.call<Project>('PATCH', '/projects/auralis', await t.login(DEMO.kevin), {
      slaDays: 3,
      strategy: 'by_module',
      moduleRules: [{ pattern: '/agenda/*', userId: 'u2' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      slaDays: 3,
      strategy: 'by_module',
      moduleRules: [{ pattern: '/agenda/*', userId: 'u2' }],
    });
  });
});

describe('Miembros', () => {
  it('lista a quien ve el proyecto y 404 a quien no', async () => {
    const ok = await t.call<ProjectMember[]>(
      'GET',
      '/projects/auralis/members',
      await t.login(DEMO.kevin),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveLength(4);
    const hidden = await t.call('GET', '/projects/auralis/members', await t.login(DEMO.sofia));
    expect(hidden.status).toBe(404);
  });

  it('agregar exige members:manage', async () => {
    const res = await t.call('POST', '/projects/auralis/members', await t.login(DEMO.andres), {
      userId: 'u4',
      role: 'viewer',
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'members:manage' });
  });

  it('agrega, y la persona pasa a ver el proyecto', async () => {
    const token = await t.login(DEMO.kevin);
    const res = await t.call<ProjectMember>('POST', '/projects/auralis/members', token, {
      userId: 'u4',
      role: 'viewer',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ userId: 'u4', projectId: 'auralis', role: 'viewer' });

    const seen = await t.call('GET', '/projects/auralis', await t.login(DEMO.sofia));
    expect(seen.status).toBe(200);

    const again = await t.call('POST', '/projects/auralis/members', token, {
      userId: 'u4',
      role: 'viewer',
    });
    expect([again.status, again.body.messageKey]).toEqual([409, 'members.exists']);
  });

  it('no agrega cuentas inexistentes ni desactivadas', async () => {
    const token = await t.login(DEMO.kevin);
    const missing = await t.call('POST', '/projects/auralis/members', token, {
      userId: 'nadie',
      role: 'viewer',
    });
    expect([missing.status, missing.body.messageKey]).toEqual([404, 'users.not_found']);
    const inactive = await t.call('POST', '/projects/auralis/members', token, {
      userId: 'u8',
      role: 'viewer',
    });
    expect([inactive.status, inactive.body.messageKey]).toEqual([409, 'users.inactive']);
  });

  it('cambia el rol; 404 si no es miembro', async () => {
    const token = await t.login(DEMO.kevin);
    const res = await t.call<ProjectMember>('PATCH', '/projects/auralis/members/u4', token, {
      role: 'designer',
    });
    expect(res.body.data?.role).toBe('designer');
    const missing = await t.call('PATCH', '/projects/auralis/members/u6', token, {
      role: 'designer',
    });
    expect([missing.status, missing.body.messageKey]).toEqual([404, 'members.not_found']);
  });

  it('no deja quitarse a uno mismo', async () => {
    const res = await t.call('DELETE', '/projects/auralis/members/u1', await t.login(DEMO.kevin));
    expect([res.status, res.body.messageKey]).toEqual([409, 'members.self']);
  });

  it('quitar a un miembro borra sus reglas por módulo', async () => {
    const token = await t.login(DEMO.kevin);
    const res = await t.call('DELETE', '/projects/auralis/members/u2', token);
    expect(res.status).toBe(204);

    const project = await t.call<Project>('GET', '/projects/auralis', token);
    expect(project.body.data?.moduleRules).toEqual([]);

    const again = await t.call('DELETE', '/projects/auralis/members/u2', token);
    expect(again.status).toBe(404);
  });
});

describe('OpenAPI', () => {
  it('documenta las rutas de organización y proyectos', () => {
    const doc = buildOpenApi(t.app);
    const paths = Object.keys(doc.paths);
    for (const path of [
      '/v1/organization',
      '/v1/users/{id}',
      '/v1/invitations',
      '/v1/invitations/{id}',
      '/v1/audit',
      '/v1/projects',
      '/v1/projects/{id}',
      '/v1/projects/{id}/members',
      '/v1/projects/{id}/members/{userId}',
    ]) {
      expect(paths).toContain(path);
    }
  });
});
