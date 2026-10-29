import type { Comment, CommentReply, Review } from '../src/shared/contract';
import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { ActivityDoc, NotificationDoc, OutboxDoc, ReviewDoc } from '../src/shared/schemas';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;
let reviews: Model<ReviewDoc>;
let notifications: Model<NotificationDoc>;

/** viewer en lideris: lee y comenta, pero no resuelve ni da veredicto. */
const CAMILA = 'camila.torres@ejemplo.co';

beforeAll(async () => {
  t = await startTestApp();
  reviews = t.app.get<Model<ReviewDoc>>(getModelToken(ReviewDoc.name));
  notifications = t.app.get<Model<NotificationDoc>>(getModelToken(NotificationDoc.name));
});

afterAll(async () => {
  await t.close();
});

const verdict = (id: string, key: string, value: string, token: string) =>
  t.call<Review>('PUT', `/reviews/${id}/screens/${key}/verdict`, token, { verdict: value });

describe('PUT /reviews/:id/screens/:key/verdict', () => {
  it('el primer veredicto pasa a in_review y reemplaza al heredado', async () => {
    const res = await verdict('QR-0011', 'a', 'approved', await t.login(DEMO.sofia));
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe('in_review');
    const screen = res.body.data?.screens.find((s) => s.key === 'a');
    expect(screen).toMatchObject({ verdict: 'approved', inherited: false });
  });

  it('sin verdicts:set es 403 con el permiso', async () => {
    const res = await verdict('QR-0011', 'b', 'approved', await t.login(DEMO.kevin));
    expect(res.status).toBe(403);
    expect(res.body.details?.permission).toBe('verdicts:set');
  });

  it('el autor no puede dar veredicto a su revisión', async () => {
    await reviews.updateOne({ _id: 'QR-0009' }, { author: 'u4' });
    const res = await verdict('QR-0009', 'b', 'approved', await t.login(DEMO.sofia));
    expect(res.status).toBe(403);
    expect(res.body.messageKey).toBe('verdicts.author_forbidden');
  });

  it('pantalla desconocida, ronda enviada y revisión cerrada', async () => {
    const laura = await t.login(DEMO.laura);
    expect((await verdict('QR-0011', 'zz', 'approved', laura)).body.messageKey).toBe(
      'screens.not_found',
    );
    const sent = await verdict('QR-0010', 'a', 'approved', laura);
    expect([sent.status, sent.body.messageKey]).toEqual([409, 'reviews.already_submitted']);
    const closed = await verdict('QR-0007', 'a', 'approved', laura);
    expect([closed.status, closed.body.messageKey]).toEqual([409, 'reviews.stale_status']);
  });

  it('un veredicto desconocido es 400', async () => {
    const res = await verdict('QR-0011', 'a', 'maybe', await t.login(DEMO.sofia));
    expect(res.status).toBe(400);
  });
});

describe('POST /reviews/:id/submit', () => {
  it('con pantallas pendientes es 409 y dice cuáles', async () => {
    const res = await t.call('POST', '/reviews/QR-0011/submit', await t.login(DEMO.sofia), {
      body: null,
    });
    expect([res.status, res.body.messageKey]).toEqual([409, 'reviews.pending_screens']);
    expect(res.body.details?.screens).toEqual(['b', 'c', 'd']);
  });

  it('con un ajuste queda changes_requested, avisa al autor y publica el evento', async () => {
    const sofia = await t.login(DEMO.sofia);
    await verdict('QR-0011', 'b', 'approved', sofia);
    await verdict('QR-0011', 'c', 'changes_requested', sofia);
    await verdict('QR-0011', 'd', 'approved', sofia);
    const res = await t.call<Review>('POST', '/reviews/QR-0011/submit', sofia, {
      body: 'Revisar el espaciado',
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe('changes_requested');
    expect(res.body.data?.pr.check).toBe('failure');
    const round = res.body.data?.rounds.find((r) => r.n === 1);
    expect(round?.verdicts).toEqual({
      a: 'approved',
      b: 'approved',
      c: 'changes_requested',
      d: 'approved',
    });
    expect(round?.submission).toMatchObject({
      by: 'u4',
      result: 'changes_requested',
      approved: 3,
      changes: 1,
      body: 'Revisar el espaciado',
    });

    const note = await notifications.findOne({ userId: 'u1', type: 'review_submitted' }).lean();
    expect(note?.text).toBe('Sofía Vargas envió la ronda 1: 3 aprobadas, 1 con ajuste de QR-0011');
    const outbox = t.app.get<Model<OutboxDoc>>(getModelToken(OutboxDoc.name));
    const event = await outbox.findOne({ type: 'ReviewSubmitted' }).lean();
    expect(event?.payload).toMatchObject({ reviewId: 'QR-0011', result: 'changes_requested' });

    const again = await t.call('POST', '/reviews/QR-0011/submit', sofia, {});
    expect([again.status, again.body.messageKey]).toEqual([409, 'reviews.already_submitted']);
  });

  it('desde open, si los veredictos heredados ya cubren todo, aprueba', async () => {
    await reviews.updateOne(
      { _id: 'QR-0013' },
      { $set: { 'screens.$[].verdict': 'approved', 'screens.$[].inherited': true } },
    );
    const res = await t.call<Review>('POST', '/reviews/QR-0013/submit', await t.login(DEMO.laura), {
      body: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe('approved');
    expect(res.body.data?.pr.check).toBe('success');
    expect(res.body.data?.rounds.at(-1)?.submission?.body).toBeNull();
  });
});

describe('comentarios', () => {
  let created: Comment | undefined;

  it('lista por revisión y por pantalla, del más antiguo al más reciente', async () => {
    const token = await t.login(DEMO.sofia);
    const all = await t.call<Comment[]>('GET', '/reviews/QR-0012/comments', token);
    expect(all.body.data?.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    const screen = await t.call<Comment[]>('GET', '/reviews/QR-0012/screens/c/comments', token);
    expect(screen.body.data?.map((c) => c.id)).toEqual(['c1']);
    const hidden = await t.call('GET', '/reviews/QR-0013/comments', token);
    expect([hidden.status, hidden.body.messageKey]).toEqual([404, 'reviews.not_found']);
  });

  it('comentar avisa a los mencionados y al autor de la revisión', async () => {
    const res = await t.call<Comment>(
      'POST',
      '/reviews/QR-0012/screens/c/comments',
      await t.login(DEMO.sofia),
      { body: '@laura ríos ¿así queda bien?', anchor: { x: 0.25, y: 0.5 }, el: null },
    );
    expect(res.status).toBe(201);
    created = res.body.data;
    expect(created).toMatchObject({
      review: 'QR-0012',
      screen: 'c',
      round: 2,
      author: 'u4',
      anchor: { x: 0.25, y: 0.5 },
      el: null,
      resolved: false,
      followUp: null,
      replies: [],
    });
    const mention = await notifications.findOne({ userId: 'u2', type: 'mention' }).lean();
    expect(mention?.text).toBe('Sofía Vargas te mencionó en «Filas modificadas»');
    expect(mention?.comment).toBe(created?.id);
    const author = await notifications
      .findOne({ userId: 'u1', type: 'reply', comment: created?.id })
      .lean();
    expect(author?.text).toBe('Sofía Vargas comentó en «Filas modificadas»');
    const activity = t.app.get<Model<ActivityDoc>>(getModelToken(ActivityDoc.name));
    expect(await activity.countDocuments({ review: 'QR-0012', type: 'comment_created' })).toBe(1);
  });

  it('un ancla fuera de 0–1 es 400; en una revisión cerrada, 409', async () => {
    const token = await t.login(DEMO.sofia);
    const bad = await t.call('POST', '/reviews/QR-0012/screens/c/comments', token, {
      body: 'x',
      anchor: { x: 2, y: 0 },
    });
    expect(bad.status).toBe(400);
    const closed = await t.call('POST', '/reviews/QR-0007/screens/a/comments', token, {
      body: 'x',
    });
    expect([closed.status, closed.body.messageKey]).toEqual([409, 'reviews.stale_status']);
  });

  it('responder avisa al autor del comentario', async () => {
    const res = await t.call<CommentReply>(
      'POST',
      '/comments/c1/replies',
      await t.login(DEMO.kevin),
      { body: 'Listo, lo cambio' },
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ author: 'u1', body: 'Listo, lo cambio' });
    const note = await notifications.findOne({ userId: 'u2', type: 'reply', comment: 'c1' }).lean();
    expect(note?.text).toBe('Kevin Martínez respondió tu comentario');
    const list = await t.call<Comment[]>(
      'GET',
      '/reviews/QR-0012/screens/c/comments',
      await t.login(DEMO.kevin),
    );
    expect(list.body.data?.[0]?.replies.at(-1)?.body).toBe('Listo, lo cambio');
  });

  it('un comentario de un proyecto que no ve «no existe»', async () => {
    const kevin = await t.login(DEMO.kevin);
    const res = await t.call<Comment>('POST', '/reviews/QR-0013/screens/a/comments', kevin, {
      body: 'Solo en auralis',
    });
    const id = res.body.data?.id ?? '';
    const reply = await t.call('POST', `/comments/${id}/replies`, await t.login(DEMO.sofia), {
      body: 'hola',
    });
    expect([reply.status, reply.body.messageKey]).toEqual([404, 'comments.not_found']);
    const missing = await t.call('PATCH', '/comments/nope', kevin, { resolved: true });
    expect([missing.status, missing.body.messageKey]).toEqual([404, 'comments.not_found']);
  });

  it('resolver: el autor o comments:resolve', async () => {
    const viewer = await t.call('PATCH', '/comments/c1', await t.login(CAMILA), { resolved: true });
    expect([viewer.status, viewer.body.messageKey]).toEqual([403, 'comments.forbidden']);
    expect(viewer.body.details?.permission).toBe('comments:resolve');
    const res = await t.call<Comment>('PATCH', '/comments/c1', await t.login(DEMO.kevin), {
      resolved: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.resolved).toBe(true);
  });

  it('seguimiento solo sobre comentarios de rondas anteriores', async () => {
    const laura = await t.login(DEMO.laura);
    const still = await t.call<Comment>('PUT', '/comments/c2/follow-up', laura, {
      followUp: 'still',
    });
    expect(still.status).toBe(200);
    expect(still.body.data).toMatchObject({ followUp: 'still', resolved: false });
    const done = await t.call<Comment>('PUT', '/comments/c2/follow-up', laura, {
      followUp: 'resolved',
    });
    expect(done.body.data).toMatchObject({ followUp: 'resolved', resolved: true });

    const current = await t.call('PUT', `/comments/${created?.id ?? ''}/follow-up`, laura, {
      followUp: 'resolved',
    });
    expect([current.status, current.body.messageKey]).toEqual([409, 'comments.not_previous_round']);
    const dev = await t.call('PUT', '/comments/c2/follow-up', await t.login(DEMO.kevin), {
      followUp: 'still',
    });
    expect(dev.status).toBe(403);
  });

  it('borrar: el autor o comments:moderate', async () => {
    const id = created?.id ?? '';
    const viewer = await t.call('DELETE', `/comments/${id}`, await t.login(CAMILA));
    expect([viewer.status, viewer.body.messageKey]).toEqual([403, 'comments.forbidden']);
    const sofia = await t.login(DEMO.sofia);
    expect((await t.call('DELETE', `/comments/${id}`, sofia)).status).toBe(204);
    const list = await t.call<Comment[]>('GET', '/reviews/QR-0012/comments', sofia);
    expect(list.body.data?.some((c) => c.id === id)).toBe(false);
  });
});
