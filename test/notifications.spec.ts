import type { Notification, NotificationPrefs } from '../src/shared/contract';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('notificaciones', () => {
  it('lista solo las propias, más recientes primero, con filtros', async () => {
    const laura = await t.login(DEMO.laura);
    const all = await t.call<Notification[]>('GET', '/notifications', laura);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(5);
    const dates = all.body.data?.map((n) => Date.parse(n.createdAt)) ?? [];
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    const unread = await t.call<Notification[]>('GET', '/notifications?unread=true', laura);
    expect(unread.body.data?.every((n) => n.readAt === null)).toBe(true);
    expect(unread.body.data).toHaveLength(3);
    const mentions = await t.call<Notification[]>('GET', '/notifications?mentions=true', laura);
    expect(mentions.body.data?.map((n) => n.type)).toEqual(['mention']);
  });

  it('el contador es un número suelto', async () => {
    const res = await t.call<number>(
      'GET',
      '/notifications/unread-count',
      await t.login(DEMO.laura),
    );
    expect(res.body.data).toBe(3);
  });

  it('marcar una: 204; ajena o inexistente: 404; repetir no cambia la fecha', async () => {
    const laura = await t.login(DEMO.laura);
    const [first] =
      (await t.call<Notification[]>('GET', '/notifications?unread=true', laura)).body.data ?? [];
    const id = first?.id ?? '';
    expect((await t.call('POST', `/notifications/${id}/read`, laura)).status).toBe(204);
    const read = (await t.call<Notification[]>('GET', '/notifications', laura)).body.data?.find(
      (n) => n.id === id,
    );
    expect(read?.readAt).not.toBeNull();
    await t.call('POST', `/notifications/${id}/read`, laura);
    const again = (await t.call<Notification[]>('GET', '/notifications', laura)).body.data?.find(
      (n) => n.id === id,
    );
    expect(again?.readAt).toBe(read?.readAt);

    const other = await t.call('POST', `/notifications/${id}/read`, await t.login(DEMO.kevin));
    expect([other.status, other.body.messageKey]).toEqual([404, 'notifications.not_found']);
  });

  it('marcar todas deja el contador en cero', async () => {
    const laura = await t.login(DEMO.laura);
    expect((await t.call('POST', '/notifications/read-all', laura)).status).toBe(204);
    const res = await t.call<number>('GET', '/notifications/unread-count', laura);
    expect(res.body.data).toBe(0);
    const kevin = await t.call<number>(
      'GET',
      '/notifications/unread-count',
      await t.login(DEMO.kevin),
    );
    expect(kevin.body.data).toBe(1);
  });
});

describe('preferencias', () => {
  const prefs: NotificationPrefs = {
    review_assigned: false,
    round_uploaded: true,
    review_submitted: true,
    mention: true,
    reply: true,
    due_soon: false,
    overdue: true,
  };

  it('sin guardar, valen las de fábrica', async () => {
    const res = await t.call<NotificationPrefs>(
      'GET',
      '/me/notification-prefs',
      await t.login(DEMO.sofia),
    );
    expect(res.body.data).toMatchObject({ reply: false, mention: true });
  });

  it('se guardan completas; incompletas, 400', async () => {
    const sofia = await t.login(DEMO.sofia);
    const put = await t.call<NotificationPrefs>('PUT', '/me/notification-prefs', sofia, prefs);
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual(prefs);
    const get = await t.call<NotificationPrefs>('GET', '/me/notification-prefs', sofia);
    expect(get.body.data).toEqual(prefs);

    const { reply, ...partial } = prefs;
    void reply;
    expect((await t.call('PUT', '/me/notification-prefs', sofia, partial)).status).toBe(400);
    // Como en todo el API, las claves desconocidas se descartan.
    const extra = await t.call<NotificationPrefs>('PUT', '/me/notification-prefs', sofia, {
      ...prefs,
      digest: true,
    });
    expect(extra.body.data).toEqual(prefs);
  });
});
