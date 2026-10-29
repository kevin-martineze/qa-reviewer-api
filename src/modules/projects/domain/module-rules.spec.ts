import { strangersIn } from './module-rules';

describe('strangersIn', () => {
  it('devuelve las personas que no son miembros, una vez cada una', () => {
    const rules = [
      { pattern: '/a/*', userId: 'u2' },
      { pattern: '/b/*', userId: 'u9' },
      { pattern: '/c/*', userId: 'u9' },
    ];
    expect(strangersIn(rules, ['u2', 'u3'])).toEqual(['u9']);
  });

  it('sin reglas no hay extraños', () => {
    expect(strangersIn([], ['u2'])).toEqual([]);
  });
});
