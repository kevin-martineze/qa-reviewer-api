import type { ApiToken, AuditEvent, CreatedToken, PaginatedResponse } from '../src/shared/contract';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('tokens de la skill', () => {
  let created: CreatedToken | undefined;

  it('lista solo los propios, más recientes primero', async () => {
    const res = await t.call<ApiToken[]>('GET', '/tokens', await t.login(DEMO.kevin));
    expect(res.status).toBe(200);
    expect(res.body.data?.map((x) => x.id)).toEqual(['t1', 't2']);
    expect(res.body.data?.[0]).toMatchObject({ prefix: 'qa_pat_7f3a', project: 'lideris' });
  });

  it('crear entrega el secreto una vez y queda en la auditoría', async () => {
    const kevin = await t.login(DEMO.kevin);
    const res = await t.call<CreatedToken>('POST', '/tokens', kevin, {
      projectId: 'lideris',
      label: '  Escritorio  ',
    });
    expect(res.status).toBe(201);
    created = res.body.data;
    expect(created?.secret).toMatch(/^qa_pat_[0-9a-f]{32}$/);
    expect(created?.token).toMatchObject({
      label: 'Escritorio',
      project: 'lideris',
      prefix: created?.secret.slice(0, 11),
      lastUsedAt: null,
    });
    const list = await t.call<ApiToken[]>('GET', '/tokens', kevin);
    expect(list.body.data?.[0]?.id).toBe(created?.token.id);
    expect(JSON.stringify(list.body)).not.toContain(created?.secret);

    const audit = await t.call<PaginatedResponse<AuditEvent>>(
      'GET',
      '/audit',
      await t.login(DEMO.laura),
    );
    const entry = audit.body.data?.items.find((e) => e.type === 'token_created');
    expect(entry?.text).toBe('creó el token «Escritorio»');
  });

  it('el secreto sirve en los endpoints de la skill', async () => {
    const res = await t.call('GET', '/reviews/QR-0012/feedback', created?.secret);
    expect(res.status).toBe(200);
  });

  it('sin tokens:own es 403; en un proyecto que no ve, 404', async () => {
    const sofia = await t.login(DEMO.sofia);
    const denied = await t.call('POST', '/tokens', sofia, { projectId: 'lideris', label: 'x' });
    expect(denied.status).toBe(403);
    expect(denied.body.details?.permission).toBe('tokens:own');
    const hidden = await t.call('POST', '/tokens', sofia, { projectId: 'auralis', label: 'x' });
    expect([hidden.status, hidden.body.messageKey]).toEqual([404, 'projects.not_found']);
  });

  it('revocar: solo los propios; después el secreto no sirve', async () => {
    const kevin = await t.login(DEMO.kevin);
    const other = await t.call('DELETE', '/tokens/t3', kevin);
    expect([other.status, other.body.messageKey]).toEqual([404, 'tokens.not_found']);

    const id = created?.token.id ?? '';
    expect((await t.call('DELETE', `/tokens/${id}`, kevin)).status).toBe(204);
    expect((await t.call('DELETE', `/tokens/${id}`, kevin)).status).toBe(404);
    const list = await t.call<ApiToken[]>('GET', '/tokens', kevin);
    expect(list.body.data?.map((x) => x.id)).toEqual(['t1', 't2']);
    const use = await t.call('GET', '/reviews/QR-0012/feedback', created?.secret);
    expect([use.status, use.body.messageKey]).toEqual([401, 'auth.invalid_token']);
  });

  it('un token de la skill no administra tokens', async () => {
    const res = await t.call('GET', '/tokens', 'qa_pat_7f3a_demo_t1');
    expect([res.status, res.body.messageKey]).toEqual([401, 'auth.token_not_allowed']);
  });
});
