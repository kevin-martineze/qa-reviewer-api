import { invalidAssignees } from './assignees';

const candidates = [
  { userId: 'u2', role: 'design_lead' as const, active: true },
  { userId: 'u3', role: 'designer' as const, active: true },
  { userId: 'u8', role: 'designer' as const, active: false },
  { userId: 'u1', role: 'developer' as const, active: true },
];

describe('invalidAssignees', () => {
  it('acepta diseñadores y líderes activos', () => {
    expect(invalidAssignees(['u2', 'u3'], candidates, 'u1')).toBeNull();
  });

  it('una lista vacía no sirve', () => {
    expect(invalidAssignees([], candidates, 'u1')).toEqual([]);
  });

  it('rechaza a quien no diseña, a inactivos, a extraños y al autor', () => {
    expect(invalidAssignees(['u1', 'u8', 'u9', 'u3'], candidates, 'u3')).toEqual([
      'u1',
      'u8',
      'u9',
      'u3',
    ]);
  });
});
