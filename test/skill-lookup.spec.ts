import type { SkillProject, SkillReviewRef } from '../src/shared/contract';
import type { Model } from 'mongoose';

import { getModelToken } from '@nestjs/mongoose';

import { ReviewDoc } from '../src/shared/schemas';

import { DEMO, startTestApp, type TestApp } from './support/app';

let t: TestApp;

/** Kevin en lideris y en auralis. */
const LIDERIS = 'qa_pat_7f3a_demo_t1';
const AURALIS = 'qa_pat_c91e_demo_t2';

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('GET /skill/project', () => {
  it('la configuración del proyecto del token', async () => {
    const res = await t.call<SkillProject>('GET', '/skill/project', LIDERIS);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 'lideris',
      limits: {
        maxScreens: 40,
        maxBytes: 5 * 1024 * 1024,
        contentTypes: ['image/png', 'image/webp'],
        viewport: { min: 1024, max: 1920 },
      },
      minSkillVersion: '0.1.0',
    });
    expect(Array.isArray(res.body.data?.maskSelectors)).toBe(true);
    expect(Array.isArray(res.body.data?.designRules)).toBe(true);
  });

  it('con sesión es 400: es un endpoint de la skill', async () => {
    const res = await t.call('GET', '/skill/project', await t.login(DEMO.kevin));
    expect([res.status, res.body.messageKey]).toEqual([400, 'skill.token_required']);
  });
});

describe('GET /skill/reviews?pr=', () => {
  it('la revisión vigente del PR con su enlace', async () => {
    const res = await t.call<SkillReviewRef>('GET', '/skill/reviews?pr=868', LIDERIS);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'QR-0012',
      status: 'open',
      round: 2,
      url: 'http://localhost:5173/reviews/QR-0012',
    });
  });

  it('otro proyecto, PR inexistente o pr inválido', async () => {
    const other = await t.call('GET', '/skill/reviews?pr=868', AURALIS);
    expect([other.status, other.body.messageKey]).toEqual([404, 'reviews.not_found']);
    const missing = await t.call('GET', '/skill/reviews?pr=99999', LIDERIS);
    expect(missing.status).toBe(404);
    expect((await t.call('GET', '/skill/reviews?pr=abc', LIDERIS)).status).toBe(400);
    expect((await t.call('GET', '/skill/reviews', LIDERIS)).status).toBe(400);
  });

  it('no muestra borradores de otra persona ni vencidas', async () => {
    const reviews = t.app.get<Model<ReviewDoc>>(getModelToken(ReviewDoc.name));
    await reviews.updateOne({ _id: 'QR-0011' }, { status: 'draft', author: 'u5' });
    const draft = await t.call('GET', '/skill/reviews?pr=870', LIDERIS);
    expect(draft.status).toBe(404);
    await reviews.updateOne({ _id: 'QR-0011' }, { author: 'u1' });
    const own = await t.call<SkillReviewRef>('GET', '/skill/reviews?pr=870', LIDERIS);
    expect(own.body.data).toMatchObject({ id: 'QR-0011', status: 'draft' });
    await reviews.updateOne({ _id: 'QR-0011' }, { status: 'expired' });
    expect((await t.call('GET', '/skill/reviews?pr=870', LIDERIS)).status).toBe(404);
  });
});
