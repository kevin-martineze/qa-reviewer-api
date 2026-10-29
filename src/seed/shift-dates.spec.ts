import { shiftDates } from './shift-dates';

const HOUR = 3_600_000;

describe('shiftDates', () => {
  it('corre las fechas ISO a cualquier profundidad', () => {
    const input = {
      createdAt: '2026-10-01T10:00:00.000Z',
      rounds: [
        {
          createdAt: '2026-10-01T12:00:00Z',
          submission: { createdAt: '2026-10-02T09:30:00.000Z' },
        },
      ],
    };
    expect(shiftDates(input, 2 * HOUR)).toEqual({
      createdAt: '2026-10-01T12:00:00.000Z',
      rounds: [
        {
          createdAt: '2026-10-01T14:00:00.000Z',
          submission: { createdAt: '2026-10-02T11:30:00.000Z' },
        },
      ],
    });
  });

  it('no toca lo que no es fecha ISO', () => {
    const input = {
      id: 'QR-0012',
      viewport: '1280 × 720',
      day: '2026-10-01',
      round: 2,
      ok: true,
      none: null,
      tags: ['a', 'b'],
    };
    expect(shiftDates(input, HOUR)).toEqual(input);
  });

  it('con delta cero devuelve lo mismo', () => {
    const input = { at: '2026-10-01T10:00:00.000Z' };
    expect(shiftDates(input, 0)).toEqual(input);
  });
});
