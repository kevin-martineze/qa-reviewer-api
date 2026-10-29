import { reviewMatch, type ReviewFilters } from './review-query';

const now = new Date('2026-10-29T12:00:00Z');
const base: ReviewFilters = { sort: 'updated', page: 1, limit: 20 };

describe('reviewMatch', () => {
  it('sin filtros: solo publicadas y de los proyectos visibles', () => {
    expect(reviewMatch(base, ['lideris'], now)).toEqual({
      status: { $in: ['open', 'in_review', 'changes_requested', 'approved', 'closed'] },
      projectId: { $in: ['lideris'] },
    });
  });

  it('owner y admin no filtran por proyecto', () => {
    expect(reviewMatch(base, null, now)).not.toHaveProperty('projectId');
  });

  it('nunca devuelve borradores aunque se pidan', () => {
    const match = reviewMatch({ ...base, status: ['draft', 'open'] }, null, now);
    expect(match.status).toEqual({ $in: ['open'] });
  });

  it('un proyecto que no ve no trae nada', () => {
    const match = reviewMatch({ ...base, project: 'auralis' }, ['lideris'], now);
    expect(match.projectId).toEqual({ $in: [] });
  });

  it('vencidas: turno de diseño y plazo pasado', () => {
    const match = reviewMatch({ ...base, overdue: true, status: ['open', 'approved'] }, null, now);
    expect(match.status).toEqual({ $in: ['open'] });
    expect(match.dueAt).toEqual({ $lt: now });
  });

  it('la búsqueda escapa caracteres de regex', () => {
    const match = reviewMatch({ ...base, q: ' QR-00(1 ' }, null, now);
    const [first] = match.$or as Array<{ _id: RegExp }>;
    expect(first?._id.source).toBe('QR-00\\(1');
    expect(first?._id.flags).toBe('i');
  });
});
