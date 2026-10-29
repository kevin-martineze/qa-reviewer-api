import type { ActivityEvent, PaginatedResponse, Review } from '../src/shared/contract';
import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { NotificationDoc, OutboxDoc } from '../src/shared/schemas';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

type Page = PaginatedResponse<Review>;
const ids = (page: Page | undefined) => page?.items.map((r) => r.id) ?? [];

describe('GET /reviews', () => {
  it('muestra solo las de proyectos visibles, más recientes primero', async () => {
    const res = await t.call<Page>('GET', '/reviews', await t.login(DEMO.sofia));
    expect(res.status).toBe(200);
    expect(res.body.data?.pagination).toEqual({ page: 1, limit: 20, total: 11 });
    expect(res.body.data?.items.every((r) => r.project === 'lideris')).toBe(true);
    const updated = res.body.data?.items.map((r) => Date.parse(r.updatedAt)) ?? [];
    expect(updated).toEqual([...updated].sort((a, b) => b - a));
  });

  it('owner y admin ven todas', async () => {
    const res = await t.call<Page>('GET', '/reviews', await t.login(DEMO.laura));
    expect(res.body.data?.pagination.total).toBe(13);
  });

  it('status repetido o único', async () => {
    const token = await t.login(DEMO.laura);
    const many = await t.call<Page>('GET', '/reviews?status=open&status=in_review', token);
    expect(ids(many.body.data).sort()).toEqual(['QR-0009', 'QR-0011', 'QR-0012', 'QR-0013']);
    const one = await t.call<Page>('GET', '/reviews?status=closed', token);
    expect(one.body.data?.pagination.total).toBe(5);
  });

  it('vencidas: en turno de diseño y con el plazo pasado', async () => {
    const res = await t.call<Page>('GET', '/reviews?overdue=true', await t.login(DEMO.laura));
    expect(ids(res.body.data)).toEqual(['QR-0009']);
  });

  it('busca por tarjeta, número de PR y módulo', async () => {
    const token = await t.login(DEMO.laura);
    const card = await t.call<Page>('GET', '/reviews?q=lider-628', token);
    expect(ids(card.body.data)).toEqual(['QR-0012']);
    const pr = await t.call<Page>('GET', '/reviews?q=868', token);
    expect(ids(pr.body.data)).toEqual(['QR-0012']);
    const module = await t.call<Page>('GET', '/reviews?q=compras', token);
    expect(ids(module.body.data).sort()).toEqual(['QR-0003', 'QR-0009', 'QR-0012']);
  });

  it('ordena por prioridad y por vencimiento (sin plazo al final)', async () => {
    const token = await t.login(DEMO.laura);
    const priority = await t.call<Page>('GET', '/reviews?sort=priority', token);
    expect(priority.body.data?.items[0]?.priority).toBe('urgent');
    const due = await t.call<Page>('GET', '/reviews?sort=due', token);
    const dues = due.body.data?.items.map((r) => r.dueAt) ?? [];
    expect(dues[0]).not.toBeNull();
    expect(dues.at(-1)).toBeNull();
  });

  it('pagina', async () => {
    const res = await t.call<Page>('GET', '/reviews?limit=5&page=3', await t.login(DEMO.laura));
    expect(res.body.data?.items).toHaveLength(3);
    expect(res.body.data?.pagination).toEqual({ page: 3, limit: 5, total: 13 });
  });

  it('un proyecto que no ve no trae nada; un orden desconocido es 400', async () => {
    const token = await t.login(DEMO.sofia);
    const hidden = await t.call<Page>('GET', '/reviews?project=auralis', token);
    expect(hidden.body.data?.pagination.total).toBe(0);
    const bad = await t.call('GET', '/reviews?sort=nombre', token);
    expect(bad.status).toBe(400);
  });
});

describe('GET /reviews/:id', () => {
  it('404 si no la ve o no existe', async () => {
    const token = await t.login(DEMO.sofia);
    const hidden = await t.call('GET', '/reviews/QR-0013', token);
    expect([hidden.status, hidden.body.messageKey]).toEqual([404, 'reviews.not_found']);
    expect((await t.call('GET', '/reviews/QR-9999', token)).status).toBe(404);
  });

  it('devuelve la forma del contrato con URLs firmadas', async () => {
    const res = await t.call<Review>('GET', '/reviews/QR-0012', await t.login(DEMO.sofia));
    expect(res.status).toBe(200);
    const review = res.body.data;
    expect(review).toMatchObject({ id: 'QR-0012', project: 'lideris', card: 'LIDER-628' });
    expect(Object.keys(review?.pr ?? {}).sort()).toEqual(
      ['base', 'check', 'commit', 'head', 'number', 'state', 'url'].sort(),
    );
    const screen = review?.screens[0];
    expect(screen?.viewport).toBe('1280 × 720');
    expect(screen?.img).toMatch(/^http:\/\/localhost:3000\/v1\/storage\/.+\?exp=\d+&sig=/);
  });

  it('la actividad sale más reciente primero', async () => {
    const res = await t.call<ActivityEvent[]>(
      'GET',
      '/reviews/QR-0012/activity',
      await t.login(DEMO.sofia),
    );
    const dates = res.body.data?.map((a) => Date.parse(a.createdAt)) ?? [];
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

describe('PUT /reviews/:id/assignees', () => {
  it('exige reviews:assign', async () => {
    const res = await t.call('PUT', '/reviews/QR-0012/assignees', await t.login(DEMO.andres), {
      assignees: ['u3'],
    });
    expect(res.status).toBe(403);
    expect(res.body.details).toEqual({ permission: 'reviews:assign' });
  });

  it('solo diseñadores activos del proyecto, nunca el autor', async () => {
    const token = await t.login(DEMO.laura);
    for (const assignees of [[], ['u1'], ['u8'], ['u6']]) {
      const res = await t.call('PUT', '/reviews/QR-0012/assignees', token, { assignees });
      expect([res.status, res.body.messageKey]).toEqual([400, 'reviews.invalid_assignees']);
    }
  });

  it('no reasigna una revisión cerrada', async () => {
    const res = await t.call('PUT', '/reviews/QR-0007/assignees', await t.login(DEMO.laura), {
      assignees: ['u3'],
    });
    expect([res.status, res.body.messageKey]).toEqual([409, 'reviews.stale_status']);
  });

  it('asigna, avisa a quien entra y deja la actividad', async () => {
    const token = await t.login(DEMO.laura);
    const res = await t.call<Review>('PUT', '/reviews/QR-0012/assignees', token, {
      assignees: ['u3', 'u4'],
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.assignees).toEqual(['u3', 'u4']);

    const notifications = t.app.get<Model<NotificationDoc>>(getModelToken(NotificationDoc.name));
    const sent = await notifications
      .find({ review: 'QR-0012', type: 'review_assigned', actor: 'u2' })
      .lean();
    expect(sent.map((n) => n.userId).sort()).toEqual(['u3', 'u4']);

    const activity = await t.call<ActivityEvent[]>('GET', '/reviews/QR-0012/activity', token);
    expect(activity.body.data?.[0]).toMatchObject({
      type: 'review_assigned',
      actor: 'u2',
      text: 'asignó la revisión a Andrés Peña, Sofía Vargas',
    });
  });
});

describe('PATCH /reviews/:id', () => {
  it('cambia la prioridad con reviews:assign', async () => {
    const res = await t.call<Review>('PATCH', '/reviews/QR-0011', await t.login(DEMO.laura), {
      priority: 'urgent',
    });
    expect(res.body.data?.priority).toBe('urgent');
    const denied = await t.call('PATCH', '/reviews/QR-0011', await t.login(DEMO.andres), {
      priority: 'low',
    });
    expect(denied.status).toBe(403);
    const bad = await t.call('PATCH', '/reviews/QR-0011', await t.login(DEMO.laura), {
      priority: 'ya',
    });
    expect(bad.status).toBe(400);
  });
});

describe('POST /reviews/:id/reopen', () => {
  it('exige reviews:reopen y un motivo', async () => {
    const denied = await t.call('POST', '/reviews/QR-0008/reopen', await t.login(DEMO.sofia), {
      reason: 'x',
    });
    expect(denied.status).toBe(403);
    const empty = await t.call('POST', '/reviews/QR-0008/reopen', await t.login(DEMO.laura), {});
    expect(empty.status).toBe(400);
  });

  it('solo reabre revisiones enviadas', async () => {
    const res = await t.call('POST', '/reviews/QR-0011/reopen', await t.login(DEMO.laura), {
      reason: 'x',
    });
    expect([res.status, res.body.messageKey]).toEqual([409, 'reviews.stale_status']);
  });

  it('anula el envío, da plazo nuevo y publica el evento', async () => {
    const token = await t.login(DEMO.laura);
    const res = await t.call<Review>('POST', '/reviews/QR-0008/reopen', token, {
      reason: 'Falta el estado vacío',
    });
    expect(res.status).toBe(200);
    const review = res.body.data;
    expect(review?.status).toBe('in_review');
    expect(review?.pr.check).toBe('pending');
    expect(review?.rounds.find((r) => r.n === review.round)?.submission).toBeNull();
    expect(Date.parse(review?.dueAt ?? '')).toBeGreaterThan(Date.now());

    const outbox = t.app.get<Model<OutboxDoc>>(getModelToken(OutboxDoc.name));
    const event = await outbox.findOne({ type: 'ReviewReopened' }).lean();
    expect(event?.payload).toMatchObject({ reviewId: 'QR-0008', reason: 'Falta el estado vacío' });

    const again = await t.call('POST', '/reviews/QR-0008/reopen', token, { reason: 'otra vez' });
    expect(again.status).toBe(409);
  });
});
