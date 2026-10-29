import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../contract';
import { forbidden } from '../http/api-error';

import { can, type Permission } from './permissions';

/** Autorización por permiso y proyecto. Responde 403 con el permiso que falta en `details`. */
@Injectable()
export class AccessService {
  assert(user: SessionUser, permission: Permission, projectId: string | null): void {
    if (!can(user, permission, projectId)) {
      throw forbidden('auth.forbidden', 'No tienes permiso para esta acción.', { permission });
    }
  }
}
