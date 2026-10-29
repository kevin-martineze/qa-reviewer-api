import { nextStatus } from './review-state';

describe('nextStatus', () => {
  it('publica un borrador', () => {
    expect(nextStatus('publish', 'draft')).toBe('open');
    expect(nextStatus('publish', 'open')).toBeNull();
  });

  it('una ronda nueva solo sale después de un envío', () => {
    expect(nextStatus('publish_round', 'changes_requested')).toBe('open');
    expect(nextStatus('publish_round', 'approved')).toBe('open');
    expect(nextStatus('publish_round', 'in_review')).toBeNull();
  });

  it('el primer veredicto pasa a in_review', () => {
    expect(nextStatus('start_review', 'open')).toBe('in_review');
    expect(nextStatus('start_review', 'in_review')).toBeNull();
  });

  it('el envío toma el resultado y lo exige', () => {
    expect(nextStatus('submit', 'in_review', 'approved')).toBe('approved');
    expect(nextStatus('submit', 'in_review', 'changes_requested')).toBe('changes_requested');
    expect(nextStatus('submit', 'in_review')).toBeNull();
    expect(nextStatus('submit', 'open', 'approved')).toBe('approved');
    expect(nextStatus('submit', 'approved', 'approved')).toBeNull();
  });

  it('reabrir solo aplica a revisiones enviadas', () => {
    expect(nextStatus('reopen', 'approved')).toBe('in_review');
    expect(nextStatus('reopen', 'changes_requested')).toBe('in_review');
    expect(nextStatus('reopen', 'in_review')).toBeNull();
    expect(nextStatus('reopen', 'closed')).toBeNull();
  });

  it('cerrar aplica a toda revisión activa y vencer solo a borradores', () => {
    for (const s of ['draft', 'open', 'in_review', 'changes_requested', 'approved'] as const) {
      expect(nextStatus('close', s)).toBe('closed');
    }
    expect(nextStatus('close', 'closed')).toBeNull();
    expect(nextStatus('expire', 'draft')).toBe('expired');
    expect(nextStatus('expire', 'open')).toBeNull();
  });
});
