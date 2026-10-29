import { denialOf, permissionFor } from './user-change';

const owner = { id: 'u7', orgRole: 'owner' as const };
const admin = { id: 'u2', orgRole: 'admin' as const };
const member = { id: 'u3', orgRole: 'member' as const };

describe('permissionFor', () => {
  it('pide org:manage solo para dar el rol owner', () => {
    expect(permissionFor({ orgRole: 'owner' })).toBe('org:manage');
    expect(permissionFor({ orgRole: 'admin' })).toBe('users:invite');
    expect(permissionFor({ status: 'inactive' })).toBe('users:invite');
  });
});

describe('denialOf', () => {
  it('no deja desactivarse a uno mismo', () => {
    expect(denialOf(admin, admin, { status: 'inactive' })?.key).toBe('users.self');
  });

  it('no deja desactivar al owner, ni siquiera a otro owner', () => {
    expect(denialOf(admin, owner, { status: 'inactive' })?.key).toBe('users.owner');
    expect(denialOf(owner, { id: 'u9', orgRole: 'owner' }, { status: 'inactive' })?.key).toBe(
      'users.owner',
    );
  });

  it('deja desactivar y reactivar a otros', () => {
    expect(denialOf(admin, member, { status: 'inactive' })).toBeNull();
    expect(denialOf(admin, member, { status: 'active' })).toBeNull();
  });

  it('no deja cambiarse el rol a uno mismo', () => {
    expect(denialOf(owner, owner, { orgRole: 'admin' })?.key).toBe('users.self');
  });

  it('solo un owner cambia el rol de otro owner', () => {
    const denial = denialOf(admin, owner, { orgRole: 'member' });
    expect(denial).toMatchObject({ status: 403, key: 'auth.forbidden', permission: 'org:manage' });
    expect(denialOf(owner, { id: 'u9', orgRole: 'owner' }, { orgRole: 'admin' })).toBeNull();
  });

  it('deja a un admin cambiar el rol de un miembro', () => {
    expect(denialOf(admin, member, { orgRole: 'admin' })).toBeNull();
  });
});
