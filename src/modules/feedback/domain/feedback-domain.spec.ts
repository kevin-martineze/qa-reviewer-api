import { findMentions } from './mentions';
import { submissionSummary, tally } from './submission';

const people = [
  { id: 'u1', name: 'Ana', email: 'ana@x.co' },
  { id: 'u2', name: 'Ana María Gómez', email: 'amgomez@x.co' },
  { id: 'u3', name: 'Andrés Peña', email: 'andres.pena@x.co' },
];

describe('findMentions', () => {
  it('prefiere el nombre más largo', () => {
    expect(findMentions('@Ana María Gómez mira esto', people)).toEqual(['u2']);
    expect(findMentions('@Ana mira esto', people)).toEqual(['u1']);
  });

  it('ignora tildes y mayúsculas, y acepta la parte local del correo', () => {
    expect(findMentions('cc @andres peña y @AMGOMEZ.', people).sort()).toEqual(['u2', 'u3']);
    expect(findMentions('ping @andres.pena', people)).toEqual(['u3']);
  });

  it('no confunde prefijos ni correos sueltos', () => {
    expect(findMentions('@anabel', people)).toEqual([]);
    expect(findMentions('escribe a ana@x.co', people)).toEqual([]);
    expect(findMentions('@Ana y @ana otra vez', people)).toEqual(['u1']);
  });
});

describe('tally', () => {
  it('cuenta y decide el resultado', () => {
    const t = tally([
      { key: 'a', verdict: 'approved' },
      { key: 'b', verdict: 'changes_requested' },
    ]);
    expect(t).toMatchObject({ pending: [], approved: 1, changes: 1, result: 'changes_requested' });
    expect(t.verdicts).toEqual({ a: 'approved', b: 'changes_requested' });
    expect(submissionSummary(2, t)).toBe('envió la ronda 2: 1 aprobadas, 1 con ajuste');
  });

  it('todo aprobado aprueba; lo pendiente se informa', () => {
    expect(tally([{ key: 'a', verdict: 'approved' }]).result).toBe('approved');
    expect(tally([{ key: 'a', verdict: 'pending' }]).pending).toEqual(['a']);
    expect(submissionSummary(1, tally([{ key: 'a', verdict: 'approved' }]))).toBe(
      'aprobó la ronda 1 (1 pantallas)',
    );
  });
});
