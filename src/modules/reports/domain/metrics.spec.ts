import { median, overview, type MetricReview } from './metrics';

const NOW = new Date('2026-10-29T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000);

const review = (over: Partial<MetricReview>): MetricReview => ({
  status: 'open',
  round: 1,
  module: 'compras',
  assignees: [],
  screens: 2,
  openedAt: at(100),
  dueAt: null,
  rounds: [{ n: 1, verdicts: {}, submission: null }],
  ...over,
});

describe('median', () => {
  it('impar, par y vacía', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('overview', () => {
  const approvedFirst = review({
    status: 'approved',
    openedAt: at(50),
    rounds: [
      {
        n: 1,
        verdicts: { a: 'approved', b: 'approved' },
        submission: { createdAt: at(40), result: 'approved' },
      },
    ],
  });
  const twoRounds = review({
    status: 'approved',
    round: 2,
    module: 'ventas',
    screens: 3,
    openedAt: at(200),
    rounds: [
      {
        n: 1,
        verdicts: { a: 'changes_requested', b: 'changes_requested', c: 'approved' },
        submission: { createdAt: at(180), result: 'changes_requested' },
      },
      {
        n: 2,
        verdicts: { a: 'approved', b: 'approved', c: 'approved' },
        submission: { createdAt: at(150), result: 'approved' },
      },
    ],
  });
  const late = review({ status: 'in_review', assignees: ['u3', 'u4'], dueAt: at(1) });
  const onTime = review({ assignees: ['u3'], dueAt: at(-24) });

  const o = overview([approvedFirst, twoRounds, late, onTime], NOW);

  it('cuenta pendientes, vencidas y rondas', () => {
    expect(o.open).toBe(2);
    expect(o.overdue).toBe(1);
    expect(o.avgRounds).toBe(1.3);
  });

  it('medianas en horas desde que quedó open', () => {
    // Primer envío: 10 h y 20 h. Aprobación: 10 h y 50 h.
    expect(o.hoursToFirstReview).toBe(15);
    expect(o.hoursToApproval).toBe(30);
    expect(o.firstRoundApprovalRate).toBe(0.5);
  });

  it('pendientes por diseñador y ajustes por módulo, de mayor a menor', () => {
    expect(o.pendingByDesigner).toEqual([
      { userId: 'u3', pending: 2, overdue: 1 },
      { userId: 'u4', pending: 1, overdue: 1 },
    ]);
    expect(o.changesByModule).toEqual([
      { module: 'ventas', changes: 2, screens: 3 },
      { module: 'compras', changes: 0, screens: 6 },
    ]);
  });

  it('seis semanas que terminan hoy', () => {
    expect(o.weekly).toHaveLength(6);
    expect(o.weekly.at(-1)).toEqual({ week: '2026-10-29', opened: 3, approved: 2 });
    expect(o.weekly.at(-2)).toMatchObject({ opened: 1, approved: 0 });
  });

  it('sin revisiones, todo en cero', () => {
    const empty = overview([], NOW);
    expect(empty).toMatchObject({ open: 0, hoursToApproval: 0, firstRoundApprovalRate: 0 });
  });
});
