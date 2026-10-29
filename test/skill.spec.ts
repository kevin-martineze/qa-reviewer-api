import type { ReviewDraft, FeedbackStatus } from '../src/modules/reviews/skill.service';
import type { ActivityEvent, Review } from '../src/shared/contract';
import type { Model } from 'mongoose';

import { createHash } from 'node:crypto';

import { getModelToken } from '@nestjs/mongoose';

import { demoTokenSecret } from '../src/seed/demo-seed';
import { CommentDoc, NotificationDoc, OutboxDoc, ReviewDoc } from '../src/shared/schemas';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

/** Token de la skill de Kevin para Lideris (developer). */
const LIDERIS = demoTokenSecret('qa_pat_7f3a', 't1');
/** Token de Kevin para Auralis. */
const AURALIS = demoTokenSecret('qa_pat_c91e', 't2');

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

/** Imagen de mentira: lo que importa es que tipo, tamaño y hash coincidan con lo declarado. */
function image(seed: string) {
  const body = Buffer.from(`png:${seed}:`.padEnd(2048, '.'));
  const sha256 = createHash('sha256').update(body).digest('hex');
  return {
    body,
    capture: { key: `${seed}.png`, contentType: 'image/png', bytes: body.length, sha256 },
  };
}

function screen(key: string, route: string, seed: string) {
  return {
    key,
    title: `Pantalla ${key}`,
    lead: 'Qué mirar',
    route,
    viewport: { width: 1280, height: 720 },
    captures: { after: image(seed).capture, before: null },
    elements: [
      {
        name: 'QuantityStepper',
        file: 'src/lib/components/QuantityStepper.svelte',
        line: 42,
        selector: '[data-qty-stepper]',
        box: { x: 0.6, y: 0.4, w: 0.1, h: 0.05 },
      },
    ],
    changes: ['Borde en color primario'],
  };
}

function manifest(screens: object[], extra: object = {}) {
  return {
    manifestVersion: 1,
    project: 'lideris',
    card: { key: 'LIDER-900', title: 'Editar ítems' },
    pr: {
      number: 900,
      url: 'https://github.com/acme/lideris/pull/900',
      title: 'feat: editar ítems',
      base: 'develop',
      head: 'feature/LIDER-900',
      author: 'kevin',
      commit: '9f2c1e7a',
    },
    title: 'Edición de ítems de la pre-orden',
    screens,
    notCaptured: [{ title: 'Guardado', body: 'Toast de éxito' }],
    privacy: { masked: true, dataset: 'qa-fixtures' },
    ...extra,
  };
}

const ROUND_1 = [screen('a', '/preorders/[id]/items', 'a1'), screen('b', '/compras', 'b1')];

const key = (k: string) => ({ 'idempotency-key': `prueba-${k}` });

async function uploadAll(draft: ReviewDraft | undefined, seeds: Record<string, string>) {
  for (const u of draft?.uploads ?? []) {
    const status = await t.upload(u.url, image(seeds[u.screenKey] ?? '').body, u.headers);
    expect(status).toBe(200);
  }
}

describe('POST /reviews', () => {
  it('exige Idempotency-Key', async () => {
    const res = await t.call('POST', '/reviews', LIDERIS, manifest(ROUND_1));
    expect([res.status, res.body.messageKey]).toEqual([400, 'idempotency.required']);
  });

  it('el token solo sirve en su proyecto', async () => {
    const res = await t.call('POST', '/reviews', AURALIS, manifest(ROUND_1), key('otro'));
    expect([res.status, res.body.messageKey]).toEqual([403, 'manifest.project_mismatch']);
  });

  it('exige capturas enmascaradas', async () => {
    const res = await t.call(
      'POST',
      '/reviews',
      LIDERIS,
      manifest(ROUND_1, { privacy: { masked: false, dataset: 'prod' } }),
      key('privacidad'),
    );
    expect([res.status, res.body.messageKey]).toEqual([422, 'manifest.privacy_required']);
  });

  it('un PR con revisión publicada pide ronda nueva', async () => {
    const m = manifest(ROUND_1, {
      pr: { ...manifest([]).pr, number: 868 },
    });
    const res = await t.call('POST', '/reviews', LIDERIS, m, key('existe'));
    expect([res.status, res.body.messageKey]).toEqual([409, 'reviews.exists']);
    expect(res.body.details).toEqual({ reviewId: 'QR-0012' });
  });

  it('crea el borrador con las URLs de subida; la web no lo ve', async () => {
    const res = await t.call<ReviewDraft>(
      'POST',
      '/reviews',
      LIDERIS,
      manifest(ROUND_1),
      key('r1'),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 'QR-0014',
      round: 1,
      status: 'draft',
      changed: ['a', 'b'],
      url: 'http://localhost:5173/reviews/QR-0014',
    });
    expect(res.body.data?.uploads.map((u) => `${u.screenKey}/${u.kind}`)).toEqual([
      'a/after',
      'b/after',
    ]);
    expect(res.body.data?.uploads[0]?.url).toContain(
      '/v1/storage/projects/lideris/reviews/QR-0014/r1/a/after.png?',
    );

    const web = await t.call('GET', '/reviews/QR-0014', await t.login(DEMO.laura));
    expect(web.status).toBe(404);
  });

  it('el mismo intento devuelve lo mismo; la misma clave con otro body es 422', async () => {
    const again = await t.call<ReviewDraft>(
      'POST',
      '/reviews',
      LIDERIS,
      manifest(ROUND_1),
      key('r1'),
    );
    expect(again.status).toBe(201);
    expect(again.body.data?.id).toBe('QR-0014');

    const other = await t.call(
      'POST',
      '/reviews',
      LIDERIS,
      manifest(ROUND_1, { title: 'Otro título' }),
      key('r1'),
    );
    expect([other.status, other.body.messageKey]).toEqual([422, 'idempotency.mismatch']);
  });
});

describe('POST /reviews/:id/publish', () => {
  it('no publica si faltan capturas', async () => {
    const res = await t.call('POST', '/reviews/QR-0014/publish', LIDERIS);
    expect([res.status, res.body.messageKey]).toEqual([422, 'reviews.missing_uploads']);
    expect(res.body.details).toEqual({ missing: ['a/after', 'b/after'] });
  });

  it('publica: asigna por módulo, fija el plazo y avisa', async () => {
    const draft = await t.call<ReviewDraft>(
      'POST',
      '/reviews',
      LIDERIS,
      manifest(ROUND_1),
      key('r1'),
    );
    await uploadAll(draft.body.data, { a: 'a1', b: 'b1' });

    const res = await t.call<ReviewDraft>('POST', '/reviews/QR-0014/publish', LIDERIS);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'QR-0014', round: 1, status: 'open', uploads: [] });

    const web = await t.call<Review>('GET', '/reviews/QR-0014', await t.login(DEMO.laura));
    const review = web.body.data;
    expect(review).toMatchObject({
      status: 'open',
      round: 1,
      author: 'u1',
      module: 'preorders',
      assignees: ['u2'],
      card: 'LIDER-900',
      notCaptured: ['Guardado: Toast de éxito'],
    });
    expect(review?.pr.check).toBe('pending');
    expect(review?.dueAt).not.toBeNull();
    expect(review?.rounds).toHaveLength(1);
    expect(review?.screens.map((s) => s.verdict)).toEqual(['pending', 'pending']);

    const activity = await t.call<ActivityEvent[]>(
      'GET',
      '/reviews/QR-0014/activity',
      await t.login(DEMO.laura),
    );
    expect(activity.body.data?.[0]).toMatchObject({
      type: 'review_published',
      text: 'publicó la revisión (2 pantallas)',
    });

    const notifications = t.app.get<Model<NotificationDoc>>(getModelToken(NotificationDoc.name));
    expect(
      await notifications.exists({ userId: 'u2', review: 'QR-0014', type: 'review_assigned' }),
    ).toBeTruthy();
    const outbox = t.app.get<Model<OutboxDoc>>(getModelToken(OutboxDoc.name));
    expect(
      await outbox.exists({ type: 'ReviewOpened', 'payload.reviewId': 'QR-0014' }),
    ).toBeTruthy();
  });

  it('publicar otra vez no tiene efectos', async () => {
    const res = await t.call<ReviewDraft>('POST', '/reviews/QR-0014/publish', LIDERIS);
    expect(res.body.data).toMatchObject({ round: 1, status: 'open' });
    const web = await t.call<Review>('GET', '/reviews/QR-0014', await t.login(DEMO.laura));
    expect(web.body.data?.rounds).toHaveLength(1);
  });
});

describe('Rondas y feedback', () => {
  const ROUND_2 = [
    screen('a', '/preorders/[id]/items', 'a1'),
    screen('b', '/compras', 'b2'),
    screen('c', '/compras/nuevo', 'c2'),
  ];

  it('no sube ronda mientras diseño revisa', async () => {
    const res = await t.call(
      'POST',
      '/reviews/QR-0014/rounds',
      LIDERIS,
      manifest(ROUND_2),
      key('r2'),
    );
    expect([res.status, res.body.messageKey]).toEqual([409, 'reviews.stale_status']);
  });

  it('el feedback antes del envío lo dice', async () => {
    const res = await t.call<FeedbackStatus>('GET', '/reviews/QR-0014/feedback', LIDERIS);
    expect(res.status).toBe(200);
    expect(res.body.data?.text).toContain('diseño todavía no envía su revisión');
  });

  it('el feedback trae veredictos y comentarios abiertos de la ronda enviada', async () => {
    // El envío es de la fase 6: se simula en la base.
    const reviews = t.app.get<Model<ReviewDoc>>(getModelToken(ReviewDoc.name));
    await reviews.updateOne(
      { _id: 'QR-0014' },
      {
        $set: {
          status: 'changes_requested',
          'screens.0.verdict': 'approved',
          'screens.1.verdict': 'changes_requested',
          'rounds.0.verdicts': { a: 'approved', b: 'changes_requested' },
          'rounds.0.submission': {
            by: 'u2',
            createdAt: new Date(),
            result: 'changes_requested',
            approved: 1,
            changes: 1,
            body: 'Casi listo',
          },
        },
      },
    );
    const comments = t.app.get<Model<CommentDoc>>(getModelToken(CommentDoc.name));
    await comments.create({
      reviewId: 'QR-0014',
      screenKey: 'b',
      round: 1,
      author: 'u2',
      body: 'El borde se pierde',
      el: { name: 'QuantityStepper', file: 'src/q.svelte', line: 42, selector: '[q]' },
    });

    const res = await t.call<FeedbackStatus>('GET', '/reviews/QR-0014/feedback', LIDERIS);
    expect(res.body.data?.comments).toHaveLength(1);
    const text = res.body.data?.text ?? '';
    expect(text).toContain(
      'Ronda 1: con ajustes pedidos por Laura Ríos (1 aprobadas, 1 con ajustes).',
    );
    expect(text).toContain('Mensaje: Casi listo');
    expect(text).toContain('1. Pantalla b (b) · /compras · ajustes');
    expect(text).toContain('Laura Ríos: «El borde se pierde» → QuantityStepper (src/q.svelte:42)');
  });

  it('rechaza una ronda sin cambios o de otro PR', async () => {
    const same = await t.call(
      'POST',
      '/reviews/QR-0014/rounds',
      LIDERIS,
      manifest(ROUND_1),
      key('igual'),
    );
    expect([same.status, same.body.messageKey]).toEqual([422, 'manifest.no_changes']);

    const otherPr = manifest(ROUND_2, { pr: { ...manifest([]).pr, number: 901 } });
    const pr = await t.call('POST', '/reviews/QR-0014/rounds', LIDERIS, otherPr, key('pr'));
    expect([pr.status, pr.body.messageKey]).toEqual([422, 'manifest.pr_mismatch']);
  });

  it('la ronda 2 sube solo lo que cambió y hereda el resto al publicar', async () => {
    const res = await t.call<ReviewDraft>(
      'POST',
      '/reviews/QR-0014/rounds',
      LIDERIS,
      manifest(ROUND_2, { note: 'Arreglé el borde' }),
      key('r2'),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      round: 2,
      status: 'changes_requested',
      changed: ['b', 'c'],
    });
    expect(res.body.data?.uploads.map((u) => u.screenKey)).toEqual(['b', 'c']);
    await uploadAll(res.body.data, { b: 'b2', c: 'c2' });

    const published = await t.call<ReviewDraft>('POST', '/reviews/QR-0014/publish', LIDERIS);
    expect(published.body.data).toMatchObject({ round: 2, status: 'open' });

    const web = await t.call<Review>('GET', '/reviews/QR-0014', await t.login(DEMO.laura));
    const review = web.body.data;
    expect(review?.round).toBe(2);
    expect(review?.assignees).toEqual(['u2']);
    expect(review?.rounds.map((r) => r.note)).toEqual([null, 'Arreglé el borde']);
    const [a, b, c] = review?.screens ?? [];
    expect(a).toMatchObject({ key: 'a', inherited: true, verdict: 'approved', changedIn: 1 });
    expect(b).toMatchObject({ key: 'b', inherited: false, verdict: 'pending', changedIn: 2 });
    expect(b?.previous).toMatch(/\/r1\/b\/after\.png\?/);
    expect(c).toMatchObject({ key: 'c', verdict: 'pending', previous: null });

    const notifications = t.app.get<Model<NotificationDoc>>(getModelToken(NotificationDoc.name));
    expect(
      await notifications.exists({ userId: 'u2', review: 'QR-0014', type: 'round_uploaded' }),
    ).toBeTruthy();
  });
});

describe('Token de la skill', () => {
  it('no sirve en endpoints de la web', async () => {
    const res = await t.call('GET', '/reviews', LIDERIS);
    expect([res.status, res.body.messageKey]).toEqual([401, 'auth.token_not_allowed']);
  });

  it('no ve revisiones de otro proyecto', async () => {
    const res = await t.call('GET', '/reviews/QR-0014/feedback', AURALIS);
    expect(res.status).toBe(404);
  });
});
