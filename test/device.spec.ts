import type {
  DeviceAuthorization,
  DeviceGrant,
  DeviceRequest,
  PaginatedResponse,
  AuditEvent,
} from '../src/shared/contract';

import { ClockService } from '../src/shared/util/clock.service';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;
let clock: ClockService;
/** Inicio de un minuto cercano: cada bloque corre su propio reloj desde aquí. */
let base: number;

const at = (seconds: number) => clock.set(new Date(base + seconds * 1000));
const client = { name: 'design-review', version: '0.1.0', hostname: 'macbook-kevin' };

beforeAll(async () => {
  t = await startTestApp();
  clock = t.app.get(ClockService);
  base = Math.ceil(Date.now() / 60_000) * 60_000;
});

afterAll(async () => {
  await t.close();
});

const start = async (repo: string | null = 'Estudio-Norte/lideris-v2') => {
  const res = await t.call<DeviceAuthorization>('POST', '/skill/device', undefined, {
    client,
    repo,
  });
  expect(res.status).toBe(201);
  const data = res.body.data;
  if (!data) throw new Error('Sin datos');
  return data;
};
const poll = (deviceCode: string) =>
  t.call<DeviceGrant>('POST', '/skill/device/token', undefined, { deviceCode });

describe('login de la skill por navegador', () => {
  it('pide un código, espera la aprobación y entrega el token una vez', async () => {
    const kevin = await t.login(DEMO.kevin);
    at(0);
    const auth = await start();
    expect(auth.userCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(auth.verificationUriComplete).toBe(`http://localhost:5173/device?code=${auth.userCode}`);
    expect(auth).toMatchObject({ expiresIn: 600, interval: 5 });

    const pending = await poll(auth.deviceCode);
    expect([pending.status, pending.body.messageKey]).toEqual([400, 'device.pending']);
    const fast = await poll(auth.deviceCode);
    expect([fast.status, fast.body.messageKey]).toEqual([429, 'device.slow_down']);

    // Minúsculas y sin guion también sirven.
    const loose = auth.userCode.toLowerCase().replace('-', '');
    const seen = await t.call<DeviceRequest>('GET', `/device/${loose}`, kevin);
    expect(seen.status).toBe(200);
    expect(seen.body.data).toMatchObject({
      userCode: auth.userCode,
      status: 'pending',
      client,
      repo: 'Estudio-Norte/lideris-v2',
      suggestedProjectId: 'lideris',
    });

    const approved = await t.call<DeviceRequest>(
      'POST',
      `/device/${auth.userCode}/approve`,
      kevin,
      { projectId: 'lideris' },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data?.status).toBe('approved');
    const twice = await t.call('POST', `/device/${auth.userCode}/approve`, kevin, {
      projectId: 'lideris',
    });
    expect([twice.status, twice.body.messageKey]).toEqual([409, 'device.used']);

    at(10);
    const granted = await poll(auth.deviceCode);
    expect(granted.status).toBe(200);
    const grant = granted.body.data;
    expect(grant?.secret).toMatch(/^qa_pat_[0-9a-f]{32}$/);
    expect(grant).toMatchObject({
      token: { label: 'Claude Code · macbook-kevin', project: 'lideris' },
      project: { id: 'lideris' },
      user: { id: 'u1', email: DEMO.kevin },
    });
    expect((await t.call('GET', '/reviews/QR-0012/feedback', grant?.secret)).status).toBe(200);

    at(20);
    const again = await poll(auth.deviceCode);
    expect([again.status, again.body.messageKey]).toEqual([409, 'device.used']);
    const after = await t.call<DeviceRequest>('GET', `/device/${auth.userCode}`, kevin);
    expect(after.body.data?.status).toBe('approved');

    const audit = await t.call<PaginatedResponse<AuditEvent>>(
      'GET',
      '/audit',
      await t.login(DEMO.laura),
    );
    expect(
      audit.body.data?.items.some((e) => e.text === 'creó el token «Claude Code · macbook-kevin»'),
    ).toBe(true);
  });

  it('aprobar exige tokens:own en un proyecto visible', async () => {
    const sofia = await t.login(DEMO.sofia);
    at(30);
    const auth = await start();
    const seen = await t.call<DeviceRequest>('GET', `/device/${auth.userCode}`, sofia);
    expect(seen.body.data?.suggestedProjectId).toBeNull();
    const denied = await t.call('POST', `/device/${auth.userCode}/approve`, sofia, {
      projectId: 'lideris',
    });
    expect(denied.status).toBe(403);
    expect(denied.body.details?.permission).toBe('tokens:own');
    const hidden = await t.call('POST', `/device/${auth.userCode}/approve`, sofia, {
      projectId: 'auralis',
    });
    expect([hidden.status, hidden.body.messageKey]).toEqual([404, 'projects.not_found']);
  });

  it('rechazar: la skill recibe device.denied', async () => {
    const kevin = await t.login(DEMO.kevin);
    at(40);
    const auth = await start(null);
    expect((await t.call('POST', `/device/${auth.userCode}/deny`, kevin)).status).toBe(204);
    const res = await poll(auth.deviceCode);
    expect([res.status, res.body.messageKey]).toEqual([403, 'device.denied']);
    const late = await t.call('POST', `/device/${auth.userCode}/approve`, kevin, {
      projectId: 'lideris',
    });
    expect([late.status, late.body.messageKey]).toEqual([409, 'device.used']);
  });

  it('a los 10 minutos vence', async () => {
    const kevin = await t.login(DEMO.kevin);
    at(50);
    const auth = await start();
    at(50 + 600);
    const res = await poll(auth.deviceCode);
    expect([res.status, res.body.messageKey]).toEqual([410, 'device.expired']);
    const seen = await t.call<DeviceRequest>('GET', `/device/${auth.userCode}`, kevin);
    expect(seen.body.data?.status).toBe('expired');
    const approve = await t.call('POST', `/device/${auth.userCode}/approve`, kevin, {
      projectId: 'lideris',
    });
    expect([approve.status, approve.body.messageKey]).toEqual([410, 'device.expired']);
  });

  it('códigos inexistentes: 404, y a los 20 en 10 minutos, 429', async () => {
    const andres = await t.login(DEMO.andres);
    at(700);
    const bad = await t.call('GET', '/device/..%2Fx', andres);
    expect([bad.status, bad.body.messageKey]).toEqual([404, 'device.not_found']);
    const unknown = await poll('qa_dev_nope');
    expect([unknown.status, unknown.body.messageKey]).toEqual([404, 'device.not_found']);
    for (let i = 1; i < 20; i += 1) await t.call('GET', '/device/ZZZZ-ZZZZ', andres);
    const limited = await t.call('GET', '/device/ZZZZ-ZZZZ', andres);
    expect([limited.status, limited.body.messageKey]).toEqual([429, 'device.rate_limited']);
  });

  it('máximo 10 solicitudes por minuto por IP', async () => {
    at(60 * 20);
    for (let i = 0; i < 10; i += 1) await start(null);
    const res = await t.call('POST', '/skill/device', undefined, { client });
    expect([res.status, res.body.messageKey]).toEqual([429, 'device.rate_limited']);
  });

  it('valida el cliente y el repo', async () => {
    at(60 * 30);
    const res = await t.call('POST', '/skill/device', undefined, {
      client: { name: 'x' },
      repo: 'no es un repo',
    });
    expect(res.status).toBe(400);
  });
});
