import { dueFrom, isOverdue } from './due';

const now = new Date('2026-10-29T12:00:00Z');
const past = new Date('2026-10-28T12:00:00Z');

describe('isOverdue', () => {
  it('vence solo en turno de diseño', () => {
    expect(isOverdue('open', past, now)).toBe(true);
    expect(isOverdue('in_review', past, now)).toBe(true);
    expect(isOverdue('changes_requested', past, now)).toBe(false);
    expect(isOverdue('approved', past, now)).toBe(false);
  });

  it('sin plazo o con plazo futuro no vence', () => {
    expect(isOverdue('open', null, now)).toBe(false);
    expect(isOverdue('open', new Date('2026-10-30T00:00:00Z'), now)).toBe(false);
  });
});

describe('dueFrom', () => {
  it('cuenta días hábiles: del jueves con 2 días al lunes', () => {
    expect(dueFrom(now, 2).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});
