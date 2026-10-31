import {
  deviceStatus,
  formatUserCode,
  newUserCode,
  normalizeUserCode,
  pollsTooSoon,
  USER_CODE_ALPHABET,
} from './device-codes';

const NOW = new Date('2026-10-31T12:00:00Z');
const later = (s: number) => new Date(NOW.getTime() + s * 1000);

describe('códigos de usuario', () => {
  it('8 caracteres del alfabeto sin 0, O, 1 ni I', () => {
    let i = 0;
    const code = newUserCode((max) => i++ % max);
    expect(code).toBe('ABCDEFGH');
    expect(USER_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(newUserCode((max) => max - 1)).toBe('99999999');
  });

  it('normaliza mayúsculas, guion y espacios; rechaza lo que no es un código', () => {
    expect(normalizeUserCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeUserCode(' ABCD EFGH ')).toBe('ABCDEFGH');
    expect(normalizeUserCode('ABCD-EFG')).toBeNull();
    expect(normalizeUserCode('ABCD-EFG0')).toBeNull();
    expect(normalizeUserCode('../x')).toBeNull();
    expect(formatUserCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('estado y sondeo', () => {
  it('used se ve aprobado; pendiente vencido se ve vencido', () => {
    expect(deviceStatus('used', later(-1), NOW)).toBe('approved');
    expect(deviceStatus('pending', later(1), NOW)).toBe('pending');
    expect(deviceStatus('pending', NOW, NOW)).toBe('expired');
    expect(deviceStatus('denied', later(-1), NOW)).toBe('denied');
    expect(deviceStatus('approved', later(-1), NOW)).toBe('approved');
  });

  it('pide esperar 5 s entre sondeos', () => {
    expect(pollsTooSoon(null, NOW)).toBe(false);
    expect(pollsTooSoon(later(-4), NOW)).toBe(true);
    expect(pollsTooSoon(later(-5), NOW)).toBe(false);
  });
});
