// Reglas de `PATCH /users/:id`: quién puede cambiar el estado o el rol de organización de quién.
import type { Permission } from '../../../shared/auth/permissions';
import type { OrgRole, UserStatus } from '../../../shared/contract';

/** Un solo cambio por petición: estado o rol, nunca los dos. */
export type UserChange = { status: UserStatus } | { orgRole: OrgRole };

export interface Party {
  id: string;
  orgRole: OrgRole;
}

export type Denial =
  | { status: 403; key: 'auth.forbidden'; message: string; permission: Permission }
  | { status: 409; key: 'users.self' | 'users.owner'; message: string };

/** Permiso que exige el cambio: dar el rol owner es de `org:manage`; el resto, de `users:invite`. */
export function permissionFor(change: UserChange): Permission {
  return 'orgRole' in change && change.orgRole === 'owner' ? 'org:manage' : 'users:invite';
}

/**
 * Reglas sobre la persona afectada, después de verificar el permiso:
 * nadie se cambia a sí mismo, el owner no se desactiva y solo un owner cambia el rol de otro.
 */
export function denialOf(actor: Party, target: Party, change: UserChange): Denial | null {
  if ('status' in change) {
    if (target.id === actor.id) {
      return { status: 409, key: 'users.self', message: 'No puedes desactivar tu propia cuenta.' };
    }
    if (target.orgRole === 'owner') {
      return { status: 409, key: 'users.owner', message: 'El owner no se puede desactivar.' };
    }
    return null;
  }
  if (target.id === actor.id) {
    return { status: 409, key: 'users.self', message: 'No puedes cambiar tu propio rol.' };
  }
  if (target.orgRole === 'owner' && actor.orgRole !== 'owner') {
    return {
      status: 403,
      key: 'auth.forbidden',
      message: 'Solo el owner cambia el rol de otro owner.',
      permission: 'org:manage',
    };
  }
  return null;
}
