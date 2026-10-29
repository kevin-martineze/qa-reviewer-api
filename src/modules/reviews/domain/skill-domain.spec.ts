import type { Manifest, ManifestScreen } from './manifest';
import type { StoredScreen } from '../../../shared/schemas';

import { DEFAULT_LIMITS } from '../../../shared/schemas';

import { assign, matchRoute } from './assignment';
import { canonicalJson } from './canonical-json';
import { manifestProblem, moduleOf, notCapturedText } from './manifest';
import { diffRound } from './round-diff';

const sha = (c: string) => c.repeat(64);

function screen(key: string, hash: string, extra: Partial<ManifestScreen> = {}): ManifestScreen {
  return {
    key,
    title: key,
    lead: '',
    route: `/compras/${key}`,
    viewport: { width: 1280, height: 720 },
    captures: {
      after: { key: `${key}.png`, contentType: 'image/png', bytes: 1000, sha256: sha(hash) },
      before: null,
    },
    elements: [],
    diff: [],
    note: null,
    changes: [],
    questions: [],
    ...extra,
  };
}

function manifest(extra: Partial<Manifest> = {}): Manifest {
  return {
    manifestVersion: 1,
    project: 'lideris',
    card: { key: 'LIDER-1', title: 'Tarjeta' },
    pr: {
      number: 10,
      url: 'https://x',
      title: 't',
      base: 'develop',
      head: 'f',
      author: 'k',
      commit: 'abc1234',
    },
    title: 'Revisión',
    context: '',
    module: '',
    note: null,
    summary: { steps: [], rules: [] },
    screens: [screen('a', 'a')],
    notCaptured: [],
    privacy: { masked: true, dataset: 'qa' },
    generator: null,
    ...extra,
  };
}

const ctx = { limits: DEFAULT_LIMITS, tokenProject: 'lideris', reviewPr: null };

describe('manifestProblem', () => {
  it('acepta un manifiesto válido', () => {
    expect(manifestProblem(manifest(), ctx)).toBeNull();
  });

  it('corta en el primer chequeo que falla, en orden', () => {
    const m = manifest({ manifestVersion: 2, privacy: { masked: false, dataset: 'x' } });
    expect(manifestProblem(m, ctx)?.key).toBe('manifest.version_unsupported');
    expect(manifestProblem(manifest({ privacy: { masked: false, dataset: 'x' } }), ctx)?.key).toBe(
      'manifest.privacy_required',
    );
  });

  it('el token solo sirve en su proyecto; la sesión no tiene proyecto fijo', () => {
    const m = manifest({ project: 'auralis' });
    expect(manifestProblem(m, ctx)).toMatchObject({
      status: 403,
      key: 'manifest.project_mismatch',
    });
    expect(manifestProblem(m, { ...ctx, tokenProject: null })).toBeNull();
  });

  it('aplica los límites del proyecto', () => {
    const many = manifest({ screens: Array.from({ length: 41 }, (_, i) => screen(`s${i}`, 'a')) });
    expect(manifestProblem(many, ctx)?.key).toBe('manifest.too_many_screens');

    const gif = screen('a', 'a');
    gif.captures.after.contentType = 'image/gif';
    expect(manifestProblem(manifest({ screens: [gif] }), ctx)?.key).toBe(
      'manifest.invalid_capture',
    );

    const big = screen('a', 'a');
    big.captures.after.bytes = DEFAULT_LIMITS.maxBytes + 1;
    expect(manifestProblem(manifest({ screens: [big] }), ctx)?.details).toEqual({
      screen: 'a',
      kind: 'after',
    });

    const narrow = screen('a', 'a', { viewport: { width: 800, height: 600 } });
    expect(manifestProblem(manifest({ screens: [narrow] }), ctx)?.key).toBe('manifest.viewport');
  });

  it('rechaza claves repetidas y un PR distinto al de la revisión', () => {
    const dup = manifest({ screens: [screen('a', 'a'), screen('a', 'b')] });
    expect(manifestProblem(dup, ctx)?.key).toBe('manifest.duplicate_screens');
    expect(manifestProblem(manifest(), { ...ctx, reviewPr: 11 })?.key).toBe('manifest.pr_mismatch');
  });
});

describe('moduleOf y notCapturedText', () => {
  it('sin módulo usa el primer segmento de la primera ruta', () => {
    expect(moduleOf(manifest())).toBe('compras');
    expect(moduleOf(manifest({ module: ' Compras ' }))).toBe('Compras');
  });

  it('guarda los estados no capturados como texto', () => {
    expect(
      notCapturedText(manifest({ notCaptured: ['Toast', { title: 'Error', body: 'red' }] })),
    ).toEqual(['Toast', 'Error: red']);
  });
});

describe('diffRound', () => {
  const keyOf = (s: string, kind: string) => `r/${s}/${kind}.png`;

  it('la ronda 1 sube todo', () => {
    const diff = diffRound([], [screen('a', 'a'), screen('b', 'b')], 1, keyOf);
    expect(diff.changed).toEqual(['a', 'b']);
    expect(diff.uploads.map((u) => u.capture.key)).toEqual(['r/a/after.png', 'r/b/after.png']);
    expect(diff.screens.every((s) => s.verdict === 'pending' && s.changedIn === 1)).toBe(true);
    expect(diff.screens[0]?.roundNote).toBeNull();
  });

  it('hereda las que no cambiaron y sube solo las nuevas o recapturadas', () => {
    const r1 = diffRound([], [screen('a', 'a'), screen('b', 'b'), screen('c', 'c')], 1, keyOf);
    const prev: StoredScreen[] = r1.screens.map((s) =>
      s.key === 'a' ? { ...s, verdict: 'approved' } : { ...s, verdict: 'changes_requested' },
    );
    const r2 = diffRound(
      prev,
      [screen('a', 'a'), screen('b', 'z', { note: 'Se arregló el borde' }), screen('d', 'd')],
      2,
      keyOf,
    );
    expect(r2.changed).toEqual(['b', 'd']);
    expect(r2.screens.map((s) => s.key)).toEqual(['a', 'b', 'd']);

    const [a, b, d] = r2.screens;
    expect(a).toMatchObject({ inherited: true, verdict: 'approved', changedIn: 1, previous: null });
    expect(b).toMatchObject({
      inherited: false,
      verdict: 'pending',
      changedIn: 2,
      roundNote: 'Se arregló el borde',
    });
    expect(b?.previous?.key).toBe('r/b/after.png');
    expect(d?.previous).toBeNull();
  });
});

describe('matchRoute', () => {
  it('* es un segmento; ** cero o más; * al final cubre el prefijo', () => {
    expect(matchRoute('/compras', '/compras')).toBe(true);
    expect(matchRoute('/compras/*/items', '/compras/[id]/items')).toBe(true);
    expect(matchRoute('/compras/*/items', '/compras/items')).toBe(false);
    expect(matchRoute('/preorders/*', '/preorders/[id]/products-services')).toBe(true);
    expect(matchRoute('/preorders/*', '/preorders')).toBe(false);
    expect(matchRoute('/**/items', '/a/b/c/items')).toBe(true);
    expect(matchRoute('/**/items', '/items')).toBe(true);
    expect(matchRoute('/**/items', '/a/b/c')).toBe(false);
  });
});

describe('assign', () => {
  const candidates = [
    { userId: 'u4', role: 'designer' as const, active: true },
    { userId: 'u2', role: 'design_lead' as const, active: true },
    { userId: 'u3', role: 'designer' as const, active: true },
    { userId: 'u8', role: 'designer' as const, active: false },
    { userId: 'u1', role: 'developer' as const, active: true },
  ];
  const base = { candidates, author: 'u1', rules: [], routes: ['/compras'], roundRobinLast: null };

  it('manual no asigna', () => {
    expect(assign('manual', base).assignees).toEqual([]);
  });

  it('round robin sigue en orden de id, circular, sin inactivos ni el autor', () => {
    expect(assign('round_robin', base)).toEqual({ assignees: ['u2'], roundRobinLast: 'u2' });
    expect(assign('round_robin', { ...base, roundRobinLast: 'u3' }).assignees).toEqual(['u4']);
    expect(assign('round_robin', { ...base, roundRobinLast: 'u4' }).assignees).toEqual(['u2']);
    expect(assign('round_robin', { ...base, author: 'u2' }).assignees).toEqual(['u3']);
  });

  it('por módulo toma la primera regla que coincide con un revisor válido', () => {
    const rules = [
      { pattern: '/pagos/*', userId: 'u2' },
      { pattern: '/compras', userId: 'u8' },
      { pattern: '/compras', userId: 'u3' },
    ];
    expect(assign('by_module', { ...base, rules }).assignees).toEqual(['u3']);
    expect(assign('by_module', { ...base, rules, routes: ['/caja'] }).assignees).toEqual([]);
  });
});

describe('canonicalJson', () => {
  it('ordena las claves en cada nivel', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
