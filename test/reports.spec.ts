import type { ReportsOverview } from '../src/shared/contract';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('GET /reports/overview', () => {
  it('owner y admin ven todos los proyectos', async () => {
    const res = await t.call<ReportsOverview>(
      'GET',
      '/reports/overview',
      await t.login(DEMO.laura),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ open: 4, overdue: 1 });
    expect(res.body.data?.weekly).toHaveLength(6);
    expect(res.body.data?.pendingByDesigner.map((d) => d.userId).sort()).toEqual(['u2', 'u3']);
  });

  it('por proyecto, con reports:view en él', async () => {
    const res = await t.call<ReportsOverview>(
      'GET',
      '/reports/overview?project=auralis',
      await t.login(DEMO.kevin),
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.open).toBe(1);
  });

  it('sin el permiso es 403; un proyecto que no ve, 404', async () => {
    const sofia = await t.login(DEMO.sofia);
    const all = await t.call('GET', '/reports/overview', sofia);
    expect(all.status).toBe(403);
    const lideris = await t.call('GET', '/reports/overview?project=lideris', sofia);
    expect(lideris.status).toBe(403);
    expect(lideris.body.details?.permission).toBe('reports:view');
    const hidden = await t.call('GET', '/reports/overview?project=auralis', sofia);
    expect([hidden.status, hidden.body.messageKey]).toEqual([404, 'projects.not_found']);
  });

  it('el rango filtra por publicación; to antes de from es 400', async () => {
    const laura = await t.login(DEMO.laura);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const empty = await t.call<ReportsOverview>('GET', `/reports/overview?from=${future}`, laura);
    expect(empty.body.data).toMatchObject({ open: 0, avgRounds: 0 });
    const bad = await t.call(
      'GET',
      `/reports/overview?from=${future}&to=2020-01-01T00:00:00.000Z`,
      laura,
    );
    expect(bad.status).toBe(400);
  });
});
