// Contrato con el frontend (qa-reviewer/src/lib/api/types.ts). Es la forma JSON de cada
// respuesta del API: fechas ISO 8601 UTC, referencias por id, sin textos de presentación
// salvo `text` en notificaciones, actividad y auditoría. Si cambia aquí, cambia en el front.

/* ── Organización y usuarios ─────────────────────────────────────────── */

export type OrgRole = 'owner' | 'admin' | 'member';
export type UserStatus = 'active' | 'inactive';

export interface Organization {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  status: UserStatus;
  /** Id del banco de avatares (`a01`…); `null` muestra las iniciales. */
  avatar: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Membership {
  projectId: string;
  role: ProjectRole;
}

/** `GET /me`: el usuario de la sesión con sus membresías. Los permisos se derivan en el front. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  status: UserStatus;
  avatar: string | null;
  memberships: Membership[];
}

/** `PATCH /me`. */
export interface ProfileInput {
  name: string;
  avatar: string | null;
}

/** `POST /invitations/:token/accept`. */
export interface AcceptInviteInput extends ProfileInput {
  password: string;
}

/** `POST /auth/login`: el server de SvelteKit guarda `token` en una cookie httpOnly. */
export interface LoginResult {
  token: string;
  user: SessionUser;
}

/* ── Proyecto ────────────────────────────────────────────────────────── */

export type ProjectRole = 'project_admin' | 'design_lead' | 'designer' | 'developer' | 'viewer';
export type AssignmentStrategy = 'manual' | 'round_robin' | 'by_module';

export interface ModuleRule {
  /** Patrón de ruta del frontend revisado, p. ej. `/preorders/*`. */
  pattern: string;
  userId: string;
}

export interface ProjectIntegrations {
  github: { connected: boolean; repo: string; checkName: string; commentOnPr: boolean };
  plane: { connected: boolean; projectKey: string; commentOnCard: boolean };
}

export interface Project {
  id: string;
  name: string;
  repo: string;
  planeKey: string;
  /** Días hábiles desde que la revisión se abre. */
  slaDays: number;
  strategy: AssignmentStrategy;
  moduleRules: ModuleRule[];
  integrations: ProjectIntegrations;
  /** Selectores que la skill tapa antes de capturar (datos sensibles). */
  maskSelectors: string[];
  /** Reglas de diseño del proyecto que la revisión previa verifica. */
  designRules: string[];
  reviewsCount: number;
}

export interface ProjectMember {
  userId: string;
  projectId: string;
  role: ProjectRole;
}

/* ── Invitación y recuperación ──────────────────────────────────────── */

export type InviteStatus = 'valid' | 'expired' | 'used' | 'revoked';
export type RecoveryStatus = 'valid' | 'expired' | 'used';

export interface InviteInfo {
  status: InviteStatus;
  email: string;
  org: string;
  inviter: string;
  role: OrgRole;
  projects: string[];
}

export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  projects: Membership[];
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
}

export interface RecoveryInfo {
  status: RecoveryStatus;
}

/* ── Revisión ────────────────────────────────────────────────────────── */

export type ReviewStatus =
  'draft' | 'open' | 'in_review' | 'changes_requested' | 'approved' | 'closed';

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface ReviewSummary {
  steps: Array<{ title: string; body: string }>;
  rules: string[];
}

export interface PullRequest {
  number: number;
  url: string;
  base: string;
  head: string;
  state: 'open' | 'merged' | 'closed';
  /** Estado del check `design-review` en GitHub. */
  check: 'pending' | 'success' | 'failure' | null;
  commit: string;
}

export interface Review {
  id: string;
  title: string;
  context: string;
  card: string;
  pr: PullRequest;
  project: string;
  module: string;
  author: string;
  assignees: string[];
  status: ReviewStatus;
  round: number;
  priority: Priority;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  screens: Screen[];
  rounds: Round[];
  summary: ReviewSummary;
  notCaptured: string[];
}

/* ── Pantalla ────────────────────────────────────────────────────────── */

export type Verdict = 'pending' | 'approved' | 'changes_requested';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElementRef {
  name: string;
  file: string;
  line: number;
  selector: string;
}

export interface ScreenElement extends ElementRef {
  id: string;
  /** Fracciones 0–1 de la imagen `img`. */
  box: Box;
}

export interface Screen {
  key: string;
  title: string;
  lead: string;
  /** Viewport de la captura, p. ej. `1280 × 720`. */
  viewport: string;
  route: string;
  /** Captura de la ronda actual (URL firmada en el API). */
  img: string | null;
  /** Misma pantalla en la rama base (develop), si existe. */
  before: string | null;
  /** Captura de la ronda anterior, si la pantalla cambió en esta ronda. */
  previous: string | null;
  /** Ronda en la que cambió por última vez. */
  changedIn: number;
  /** Conserva el veredicto de la ronda anterior porque no cambió. */
  inherited: boolean;
  roundNote: string | null;
  diff: Box[];
  elements: ScreenElement[];
  changes: string[];
  questions: string[];
  verdict: Verdict;
}

/* ── Ronda ───────────────────────────────────────────────────────────── */

export interface RoundSubmission {
  by: string;
  createdAt: string;
  result: 'approved' | 'changes_requested';
  approved: number;
  changes: number;
  body: string | null;
}

export interface Round {
  n: number;
  by: string;
  createdAt: string;
  note: string | null;
  changed: string[];
  verdicts: Record<string, Verdict>;
  submission: RoundSubmission | null;
}

/* ── Comentario ──────────────────────────────────────────────────────── */

export type FollowUp = 'resolved' | 'still' | null;

export interface Anchor {
  x: number;
  y: number;
}

export interface CommentReply {
  id: string;
  author: string;
  createdAt: string;
  body: string;
}

export interface Comment {
  id: string;
  review: string;
  screen: string;
  round: number;
  author: string;
  createdAt: string;
  body: string;
  anchor: Anchor | null;
  el: ElementRef | null;
  resolved: boolean;
  followUp: FollowUp;
  replies: CommentReply[];
}

/* ── Notificaciones ──────────────────────────────────────────────────── */

export type NotificationType =
  | 'review_assigned'
  | 'round_uploaded'
  | 'review_submitted'
  | 'mention'
  | 'reply'
  | 'due_soon'
  | 'overdue';

export interface Notification {
  id: string;
  type: NotificationType;
  actor: string | null;
  review: string | null;
  screen: string | null;
  comment: string | null;
  text: string;
  createdAt: string;
  readAt: string | null;
}

/** Qué eventos llegan también por correo; in-app siempre llega. */
export type NotificationPrefs = Record<NotificationType, boolean>;

/* ── Actividad y auditoría ───────────────────────────────────────────── */

export type ActivityType =
  | 'review_published'
  | 'round_uploaded'
  | 'review_assigned'
  | 'verdict_set'
  | 'comment_created'
  | 'comment_replied'
  | 'comment_resolved'
  | 'review_submitted'
  | 'review_reopened'
  | 'review_closed';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  actor: string;
  review: string;
  text: string;
  createdAt: string;
}

export type AuditType =
  | 'user_invited'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'role_changed'
  | 'member_added'
  | 'member_removed'
  | 'token_created'
  | 'token_revoked'
  | 'project_created'
  | 'project_updated';

export interface AuditEvent {
  id: string;
  type: AuditType;
  actor: string;
  target: string;
  text: string;
  createdAt: string;
}

/* ── Tokens de la skill ──────────────────────────────────────────────── */

export interface ApiToken {
  id: string;
  label: string;
  /** Solo el prefijo: el token completo se muestra una vez al crearlo. */
  prefix: string;
  project: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedToken {
  token: ApiToken;
  /** Valor completo; el API no lo vuelve a entregar. */
  secret: string;
}

/* ── Login de la skill por navegador (device flow, RFC 8628) ─────────── */

export type DeviceStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** Equipo desde el que la skill pide acceso. Lo informa la skill: es texto, no prueba nada. */
export interface DeviceClient {
  name: string;
  version: string;
  hostname: string;
}

export interface DeviceRequest {
  /** `ABCD-EFGH`, el código que la terminal muestra a la persona. */
  userCode: string;
  status: DeviceStatus;
  expiresAt: string;
  client: DeviceClient;
  /** `owner/repo` del remoto de git donde corre la skill. */
  repo: string | null;
  /** Proyecto con ese repo en el que la persona puede publicar (`tokens:own`). */
  suggestedProjectId: string | null;
}

/** `POST /skill/device`: lo que la skill muestra y con qué sondea. */
export interface DeviceAuthorization {
  /** Secreto de la skill para sondear; el API guarda su SHA-256. */
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** Segundos de vida del código. */
  expiresIn: number;
  /** Segundos mínimos entre sondeos. */
  interval: number;
}

/** `POST /skill/device/token` aprobado: se entrega una sola vez. */
export interface DeviceGrant {
  secret: string;
  token: ApiToken;
  project: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

/* ── Skill: configuración y búsqueda ─────────────────────────────────── */

/** `GET /skill/project`: lo que la skill necesita antes de capturar. */
export interface SkillProject {
  id: string;
  name: string;
  /** Selectores CSS que la captura tapa (`privacy.masked`). */
  maskSelectors: string[];
  designRules: string[];
  limits: {
    maxScreens: number;
    maxBytes: number;
    contentTypes: string[];
    viewport: { min: number; max: number };
  };
  /** Semver: una skill más vieja debe actualizarse. */
  minSkillVersion: string;
}

/** `GET /skill/reviews?pr=`: la revisión vigente de un PR. */
export interface SkillReviewRef {
  id: string;
  status: ReviewStatus;
  round: number;
  /** Enlace a la revisión en la web. */
  url: string;
}

/* ── Métricas ────────────────────────────────────────────────────────── */

export interface ReportFilters {
  project?: string;
  from?: string;
  to?: string;
}

export interface ReportsOverview {
  open: number;
  overdue: number;
  /** Horas medianas desde `open` hasta el primer envío. */
  hoursToFirstReview: number;
  /** Horas medianas desde `open` hasta la aprobación. */
  hoursToApproval: number;
  /** 0–1. */
  firstRoundApprovalRate: number;
  avgRounds: number;
  pendingByDesigner: Array<{ userId: string; pending: number; overdue: number }>;
  changesByModule: Array<{ module: string; changes: number; screens: number }>;
  weekly: Array<{ week: string; opened: number; approved: number }>;
}

/* ── Paginación ──────────────────────────────────────────────────────── */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}
