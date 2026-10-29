// Matriz de permisos: la misma que usa el front (src/lib/domain/permissions.ts).
// Los roles son conjuntos fijos (ADR 0007); owner y admin cuentan como project_admin.
import type { OrgRole, ProjectRole, SessionUser } from '../contract';

export const PERMISSIONS = [
  'org:manage',
  'users:invite',
  'projects:create',
  'projects:configure',
  'members:manage',
  'reviews:read',
  'reviews:create',
  'reviews:assign',
  'verdicts:set',
  'reviews:reopen',
  'comments:create',
  'comments:resolve',
  'comments:moderate',
  'tokens:own',
  'reports:view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ORG_ROLES: readonly OrgRole[] = ['owner', 'admin', 'member'];
export const PROJECT_ROLES: readonly ProjectRole[] = [
  'project_admin',
  'design_lead',
  'designer',
  'developer',
  'viewer',
];

const ALL: Array<OrgRole | ProjectRole> = [
  'owner',
  'admin',
  'project_admin',
  'design_lead',
  'designer',
  'developer',
  'viewer',
];

export const GRANTS: Record<Permission, ReadonlyArray<OrgRole | ProjectRole>> = {
  'org:manage': ['owner'],
  'users:invite': ['owner', 'admin'],
  'projects:create': ['owner', 'admin'],
  'projects:configure': ['owner', 'admin', 'project_admin'],
  'members:manage': ['owner', 'admin', 'project_admin'],
  'reviews:read': ALL,
  'reviews:create': ['project_admin', 'developer'],
  'reviews:assign': ['owner', 'admin', 'project_admin', 'design_lead'],
  'verdicts:set': ['design_lead', 'designer'],
  'reviews:reopen': ['project_admin', 'design_lead'],
  'comments:create': ALL,
  'comments:resolve': ['project_admin', 'design_lead', 'designer', 'developer'],
  'comments:moderate': ['owner', 'admin', 'project_admin', 'design_lead'],
  'tokens:own': ['project_admin', 'developer'],
  'reports:view': ['owner', 'admin', 'project_admin', 'design_lead'],
};

export function isOrgAdmin(user: Pick<SessionUser, 'orgRole'>): boolean {
  return user.orgRole === 'owner' || user.orgRole === 'admin';
}

export function permissionsOf(orgRole: OrgRole, projectRole?: ProjectRole): Set<Permission> {
  const roles = new Set<OrgRole | ProjectRole>();
  if (projectRole) roles.add(projectRole);
  if (orgRole === 'owner' || orgRole === 'admin') {
    roles.add(orgRole);
    roles.add('project_admin');
  }
  const out = new Set<Permission>();
  for (const perm of PERMISSIONS) {
    if (GRANTS[perm].some((r) => roles.has(r))) out.add(perm);
  }
  return out;
}

export function projectRoleOf(user: SessionUser, projectId: string): ProjectRole | undefined {
  return user.memberships.find((m) => m.projectId === projectId)?.role;
}

/** Permisos del usuario dentro de un proyecto; sin proyecto, solo los de organización. */
export function permissionsFor(user: SessionUser, projectId: string | null): Set<Permission> {
  return permissionsOf(user.orgRole, projectId ? projectRoleOf(user, projectId) : undefined);
}

export function can(user: SessionUser, permission: Permission, projectId: string | null): boolean {
  return permissionsFor(user, projectId).has(permission);
}

/** ¿Tiene el permiso en al menos un proyecto (o por su rol de organización)? */
export function canSomewhere(user: SessionUser, permission: Permission): boolean {
  if (permissionsOf(user.orgRole).has(permission)) return true;
  return user.memberships.some((m) => permissionsOf(user.orgRole, m.role).has(permission));
}

/** Proyectos que la persona puede abrir: todos para owner y admin, si no los suyos. */
export function canSeeProject(user: SessionUser, projectId: string): boolean {
  return isOrgAdmin(user) || user.memberships.some((m) => m.projectId === projectId);
}
