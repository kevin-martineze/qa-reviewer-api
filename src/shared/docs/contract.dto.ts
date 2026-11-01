// Clases de documentación: la forma JSON de cada respuesta para el OpenAPI (`/docs-json`).
// Cada clase implementa su interfaz del contrato, así TypeScript avisa si se desalinean.
import type * as C from '../contract';

import { ApiProperty, ApiSchema } from '@nestjs/swagger';

/**
 * Valores de una unión del contrato. Falla al compilar si falta alguno, así el OpenAPI no se
 * queda atrás cuando el contrato crece.
 */
const all =
  <T extends string>() =>
  <const A extends readonly T[]>(values: A & ([T] extends [A[number]] ? unknown : never)) => [
    ...values,
  ];

const ORG_ROLES = all<C.OrgRole>()(['owner', 'admin', 'member']);
const USER_STATUSES = all<C.UserStatus>()(['active', 'inactive']);
const PROJECT_ROLES = all<C.ProjectRole>()([
  'project_admin',
  'design_lead',
  'designer',
  'developer',
  'viewer',
]);
const STRATEGIES = all<C.AssignmentStrategy>()(['manual', 'round_robin', 'by_module']);
const INVITE_STATUSES = all<C.InviteStatus>()(['valid', 'expired', 'used', 'revoked']);
const RECOVERY_STATUSES = all<C.RecoveryStatus>()(['valid', 'expired', 'used']);
const REVIEW_STATUSES = all<C.ReviewStatus>()([
  'draft',
  'open',
  'in_review',
  'changes_requested',
  'approved',
  'closed',
]);
const VERDICTS = all<C.Verdict>()(['pending', 'approved', 'changes_requested']);
const PRIORITIES = all<C.Priority>()(['urgent', 'high', 'medium', 'low']);
const FOLLOW_UPS = all<Exclude<C.FollowUp, null>>()(['resolved', 'still']);
const AUDIT_TYPES = all<C.AuditType>()([
  'user_invited',
  'user_deactivated',
  'user_reactivated',
  'role_changed',
  'member_added',
  'member_removed',
  'token_created',
  'token_revoked',
  'project_created',
  'project_updated',
]);
const NOTIFICATION_TYPES = all<C.NotificationType>()([
  'review_assigned',
  'round_uploaded',
  'review_submitted',
  'mention',
  'reply',
  'due_soon',
  'overdue',
]);
const ACTIVITY_TYPES = all<C.ActivityType>()([
  'review_published',
  'round_uploaded',
  'review_assigned',
  'verdict_set',
  'comment_created',
  'comment_replied',
  'comment_resolved',
  'review_submitted',
  'review_reopened',
  'review_closed',
]);

/* ── Personas ─────────────────────────────────────────────────────── */

@ApiSchema({ name: 'Organization' })
export class OrganizationDto implements C.Organization {
  @ApiProperty({ example: 'acme' }) id: string;
  @ApiProperty({ example: 'Acme' }) name: string;
}

@ApiSchema({ name: 'Membership' })
export class MembershipDto implements C.Membership {
  @ApiProperty({ example: 'lideris' }) projectId: string;
  @ApiProperty({ enum: PROJECT_ROLES, enumName: 'ProjectRole' }) role: C.ProjectRole;
}

@ApiSchema({ name: 'User' })
export class UserDto implements C.User {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ORG_ROLES, enumName: 'OrgRole' }) orgRole: C.OrgRole;
  @ApiProperty({ enum: USER_STATUSES, enumName: 'UserStatus' }) status: C.UserStatus;
  @ApiProperty({ type: String, nullable: true, example: 'a01' }) avatar: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastSeenAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

@ApiSchema({ name: 'SessionUser' })
export class SessionUserDto implements C.SessionUser {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ORG_ROLES, enumName: 'OrgRole' }) orgRole: C.OrgRole;
  @ApiProperty({ enum: USER_STATUSES, enumName: 'UserStatus' }) status: C.UserStatus;
  @ApiProperty({ type: String, nullable: true }) avatar: string | null;
  @ApiProperty({ type: [MembershipDto] }) memberships: MembershipDto[];
}

@ApiSchema({ name: 'LoginResult' })
export class LoginResultDto implements C.LoginResult {
  @ApiProperty({ example: 'qa_sess_…', description: 'Se guarda en una cookie httpOnly' })
  token: string;
  @ApiProperty({ type: SessionUserDto }) user: SessionUserDto;
}

@ApiSchema({ name: 'InviteInfo' })
export class InviteInfoDto implements C.InviteInfo {
  @ApiProperty({ enum: INVITE_STATUSES, enumName: 'InviteStatus' }) status: C.InviteStatus;
  @ApiProperty() email: string;
  @ApiProperty() org: string;
  @ApiProperty() inviter: string;
  @ApiProperty({ enum: ORG_ROLES, enumName: 'OrgRole' }) role: C.OrgRole;
  @ApiProperty({ type: [String], description: 'Nombres de los proyectos' }) projects: string[];
}

@ApiSchema({ name: 'Invitation' })
export class InvitationDto implements C.Invitation {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ORG_ROLES, enumName: 'OrgRole' }) role: C.OrgRole;
  @ApiProperty({ type: [MembershipDto] }) projects: MembershipDto[];
  @ApiProperty() invitedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
  @ApiProperty({ enum: INVITE_STATUSES, enumName: 'InviteStatus' }) status: C.InviteStatus;
}

@ApiSchema({ name: 'CreatedInvitation' })
export class CreatedInvitationDto implements C.CreatedInvitation {
  @ApiProperty({ type: InvitationDto }) invitation: InvitationDto;
  @ApiProperty({
    example: 'https://qa-reviewer.vercel.app/invite/…',
    description: 'Enlace para aceptar; solo se entrega al crear o renovar',
  })
  acceptUrl: string;
}

@ApiSchema({ name: 'RecoveryInfo' })
export class RecoveryInfoDto implements C.RecoveryInfo {
  @ApiProperty({ enum: RECOVERY_STATUSES, enumName: 'RecoveryStatus' }) status: C.RecoveryStatus;
}

/* ── Proyectos ────────────────────────────────────────────────────── */

@ApiSchema({ name: 'ModuleRule' })
export class ModuleRuleDto implements C.ModuleRule {
  @ApiProperty({ example: '/preorders/*' }) pattern: string;
  @ApiProperty() userId: string;
}

@ApiSchema({ name: 'GithubIntegration' })
class GithubIntegrationDto {
  @ApiProperty() connected: boolean;
  @ApiProperty({ example: 'acme/web' }) repo: string;
  @ApiProperty({ example: 'design-review' }) checkName: string;
  @ApiProperty() commentOnPr: boolean;
}

@ApiSchema({ name: 'PlaneIntegration' })
class PlaneIntegrationDto {
  @ApiProperty() connected: boolean;
  @ApiProperty({ example: 'WEB' }) projectKey: string;
  @ApiProperty() commentOnCard: boolean;
}

@ApiSchema({ name: 'ProjectIntegrations' })
export class ProjectIntegrationsDto implements C.ProjectIntegrations {
  @ApiProperty({ type: GithubIntegrationDto }) github: GithubIntegrationDto;
  @ApiProperty({ type: PlaneIntegrationDto }) plane: PlaneIntegrationDto;
}

@ApiSchema({ name: 'Project' })
export class ProjectDto implements C.Project {
  @ApiProperty({ example: 'lideris', description: 'Slug; no cambia' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() repo: string;
  @ApiProperty() planeKey: string;
  @ApiProperty({ minimum: 1, maximum: 15 }) slaDays: number;
  @ApiProperty({ enum: STRATEGIES, enumName: 'AssignmentStrategy' }) strategy: C.AssignmentStrategy;
  @ApiProperty({ type: [ModuleRuleDto] }) moduleRules: ModuleRuleDto[];
  @ApiProperty({ type: ProjectIntegrationsDto }) integrations: ProjectIntegrationsDto;
  @ApiProperty({ type: [String] }) maskSelectors: string[];
  @ApiProperty({ type: [String] }) designRules: string[];
  @ApiProperty() reviewsCount: number;
}

@ApiSchema({ name: 'ProjectMember' })
export class ProjectMemberDto implements C.ProjectMember {
  @ApiProperty() userId: string;
  @ApiProperty() projectId: string;
  @ApiProperty({ enum: PROJECT_ROLES, enumName: 'ProjectRole' }) role: C.ProjectRole;
}

/* ── Revisiones ───────────────────────────────────────────────────── */

@ApiSchema({ name: 'Box' })
export class BoxDto implements C.Box {
  @ApiProperty({ minimum: 0, maximum: 1 }) x: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) y: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) w: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) h: number;
}

@ApiSchema({ name: 'ElementRef' })
export class ElementRefDto implements C.ElementRef {
  @ApiProperty({ example: 'QuantityStepper' }) name: string;
  @ApiProperty({ example: 'src/lib/components/QuantityStepper.svelte' }) file: string;
  @ApiProperty({ example: 42 }) line: number;
  @ApiProperty({ example: '[data-qty-stepper]' }) selector: string;
}

@ApiSchema({ name: 'ScreenElement' })
export class ScreenElementDto extends ElementRefDto implements C.ScreenElement {
  @ApiProperty() id: string;
  @ApiProperty({ type: BoxDto }) box: BoxDto;
}

@ApiSchema({ name: 'Screen' })
export class ScreenDto implements C.Screen {
  @ApiProperty({ example: 'edit-with-changes-1280' }) key: string;
  @ApiProperty() title: string;
  @ApiProperty() lead: string;
  @ApiProperty({ example: '1280 × 720' }) viewport: string;
  @ApiProperty({ example: '/preorders/[id]' }) route: string;
  @ApiProperty({ type: String, nullable: true, description: 'URL firmada (15 min)' }) img:
    string | null;
  @ApiProperty({ type: String, nullable: true }) before: string | null;
  @ApiProperty({ type: String, nullable: true }) previous: string | null;
  @ApiProperty() changedIn: number;
  @ApiProperty() inherited: boolean;
  @ApiProperty({ type: String, nullable: true }) roundNote: string | null;
  @ApiProperty({ type: [BoxDto] }) diff: BoxDto[];
  @ApiProperty({ type: [ScreenElementDto] }) elements: ScreenElementDto[];
  @ApiProperty({ type: [String] }) changes: string[];
  @ApiProperty({ type: [String] }) questions: string[];
  @ApiProperty({ enum: VERDICTS, enumName: 'Verdict' }) verdict: C.Verdict;
}

@ApiSchema({ name: 'RoundSubmission' })
export class RoundSubmissionDto implements C.RoundSubmission {
  @ApiProperty() by: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ enum: ['approved', 'changes_requested'] }) result:
    'approved' | 'changes_requested';
  @ApiProperty() approved: number;
  @ApiProperty() changes: number;
  @ApiProperty({ type: String, nullable: true }) body: string | null;
}

@ApiSchema({ name: 'Round' })
export class RoundDto implements C.Round {
  @ApiProperty() n: number;
  @ApiProperty() by: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: [String] }) changed: string[];
  @ApiProperty({ type: 'object', additionalProperties: { $ref: '#/components/schemas/Verdict' } })
  verdicts: Record<string, C.Verdict>;
  @ApiProperty({ type: RoundSubmissionDto, nullable: true }) submission: RoundSubmissionDto | null;
}

@ApiSchema({ name: 'PullRequest' })
export class PullRequestDto implements C.PullRequest {
  @ApiProperty() number: number;
  @ApiProperty() url: string;
  @ApiProperty() base: string;
  @ApiProperty() head: string;
  @ApiProperty({ enum: ['open', 'merged', 'closed'] }) state: 'open' | 'merged' | 'closed';
  @ApiProperty({ type: String, enum: ['pending', 'success', 'failure'], nullable: true })
  check: 'pending' | 'success' | 'failure' | null;
  @ApiProperty() commit: string;
}

@ApiSchema({ name: 'SummaryStep' })
class SummaryStepDto {
  @ApiProperty() title: string;
  @ApiProperty() body: string;
}

@ApiSchema({ name: 'ReviewSummary' })
export class ReviewSummaryDto implements C.ReviewSummary {
  @ApiProperty({ type: [SummaryStepDto] }) steps: SummaryStepDto[];
  @ApiProperty({ type: [String] }) rules: string[];
}

@ApiSchema({ name: 'Review' })
export class ReviewDto implements C.Review {
  @ApiProperty({ example: 'QR-0012' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() context: string;
  @ApiProperty({ example: 'LIDER-628' }) card: string;
  @ApiProperty({ type: PullRequestDto }) pr: PullRequestDto;
  @ApiProperty() project: string;
  @ApiProperty() module: string;
  @ApiProperty() author: string;
  @ApiProperty({ type: [String] }) assignees: string[];
  @ApiProperty({ enum: REVIEW_STATUSES, enumName: 'ReviewStatus' }) status: C.ReviewStatus;
  @ApiProperty() round: number;
  @ApiProperty({ enum: PRIORITIES, enumName: 'Priority' }) priority: C.Priority;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) dueAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
  @ApiProperty({ type: [ScreenDto] }) screens: ScreenDto[];
  @ApiProperty({ type: [RoundDto] }) rounds: RoundDto[];
  @ApiProperty({ type: ReviewSummaryDto }) summary: ReviewSummaryDto;
  @ApiProperty({ type: [String] }) notCaptured: string[];
}

@ApiSchema({ name: 'Pagination' })
export class PaginationDto implements C.Pagination {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

@ApiSchema({ name: 'ReviewPage' })
export class ReviewPageDto implements C.PaginatedResponse<C.Review> {
  @ApiProperty({ type: [ReviewDto] }) items: ReviewDto[];
  @ApiProperty({ type: PaginationDto }) pagination: PaginationDto;
}

@ApiSchema({ name: 'ActivityEvent' })
export class ActivityEventDto implements C.ActivityEvent {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ACTIVITY_TYPES, enumName: 'ActivityType' }) type: C.ActivityType;
  @ApiProperty() actor: string;
  @ApiProperty() review: string;
  @ApiProperty() text: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

@ApiSchema({ name: 'Upload' })
export class UploadDto {
  @ApiProperty() screenKey: string;
  @ApiProperty({ enum: ['after', 'before'] }) kind: 'after' | 'before';
  @ApiProperty({ description: 'URL PUT firmada' }) url: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers: Record<string, string>;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}

@ApiSchema({ name: 'Draft' })
export class DraftDto {
  @ApiProperty({ example: 'QR-0013' }) id: string;
  @ApiProperty({ example: 1 }) round: number;
  @ApiProperty({ enum: ['draft', 'open', 'in_review', 'changes_requested', 'approved'] })
  status: string;
  @ApiProperty({ type: [UploadDto] }) uploads: UploadDto[];
  @ApiProperty({ type: [String], description: 'Pantallas que cambiaron en esta ronda' })
  changed: string[];
  @ApiProperty({ example: 'http://localhost:5173/reviews/QR-0013' }) url: string;
}

@ApiSchema({ name: 'FeedbackStatus' })
export class FeedbackStatusDto {
  @ApiProperty({ type: ReviewDto }) review: ReviewDto;
  @ApiProperty({ type: () => [CommentDto] }) comments: CommentDto[];
  @ApiProperty({ description: 'Texto listo para la sesión de Claude Code' }) text: string;
}

/* ── Comentarios ──────────────────────────────────────────────────── */

@ApiSchema({ name: 'Anchor' })
export class AnchorDto implements C.Anchor {
  @ApiProperty({ minimum: 0, maximum: 1 }) x: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) y: number;
}

@ApiSchema({ name: 'CommentReply' })
export class CommentReplyDto implements C.CommentReply {
  @ApiProperty() id: string;
  @ApiProperty() author: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() body: string;
}

@ApiSchema({ name: 'Comment' })
export class CommentDto implements C.Comment {
  @ApiProperty() id: string;
  @ApiProperty() review: string;
  @ApiProperty() screen: string;
  @ApiProperty() round: number;
  @ApiProperty() author: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() body: string;
  @ApiProperty({ type: AnchorDto, nullable: true }) anchor: AnchorDto | null;
  @ApiProperty({ type: ElementRefDto, nullable: true }) el: ElementRefDto | null;
  @ApiProperty() resolved: boolean;
  @ApiProperty({ enum: FOLLOW_UPS, enumName: 'FollowUp', nullable: true }) followUp: C.FollowUp;
  @ApiProperty({ type: [CommentReplyDto] }) replies: CommentReplyDto[];
}

/* ── Notificaciones, auditoría, tokens ────────────────────────────── */

@ApiSchema({ name: 'Notification' })
export class NotificationDto implements C.Notification {
  @ApiProperty() id: string;
  @ApiProperty({ enum: NOTIFICATION_TYPES, enumName: 'NotificationType' }) type: C.NotificationType;
  @ApiProperty({ type: String, nullable: true }) actor: string | null;
  @ApiProperty({ type: String, nullable: true }) review: string | null;
  @ApiProperty({ type: String, nullable: true }) screen: string | null;
  @ApiProperty({ type: String, nullable: true }) comment: string | null;
  @ApiProperty() text: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readAt: string | null;
}

@ApiSchema({ name: 'NotificationPrefs' })
export class NotificationPrefsDto implements C.NotificationPrefs {
  @ApiProperty() review_assigned: boolean;
  @ApiProperty() round_uploaded: boolean;
  @ApiProperty() review_submitted: boolean;
  @ApiProperty() mention: boolean;
  @ApiProperty() reply: boolean;
  @ApiProperty() due_soon: boolean;
  @ApiProperty() overdue: boolean;
}

@ApiSchema({ name: 'AuditEvent' })
export class AuditEventDto implements C.AuditEvent {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AUDIT_TYPES, enumName: 'AuditType' }) type: C.AuditType;
  @ApiProperty() actor: string;
  @ApiProperty() target: string;
  @ApiProperty() text: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

@ApiSchema({ name: 'AuditPage' })
export class AuditPageDto implements C.PaginatedResponse<C.AuditEvent> {
  @ApiProperty({ type: [AuditEventDto] }) items: AuditEventDto[];
  @ApiProperty({ type: PaginationDto }) pagination: PaginationDto;
}

@ApiSchema({ name: 'ApiToken' })
export class ApiTokenDto implements C.ApiToken {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ example: 'qa_pat_7f3a' }) prefix: string;
  @ApiProperty() project: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastUsedAt: string | null;
}

@ApiSchema({ name: 'CreatedToken' })
export class CreatedTokenDto implements C.CreatedToken {
  @ApiProperty({ type: ApiTokenDto }) token: ApiTokenDto;
  @ApiProperty({ example: 'qa_pat_…', description: 'Solo se entrega una vez' }) secret: string;
}

/* ── Login de la skill por navegador ──────────────────────────────── */

@ApiSchema({ name: 'DeviceClient' })
export class DeviceClientDto implements C.DeviceClient {
  @ApiProperty({ example: 'design-review' }) name: string;
  @ApiProperty({ example: '0.1.0' }) version: string;
  @ApiProperty({ example: 'macbook-kevin' }) hostname: string;
}

@ApiSchema({ name: 'DeviceRequest' })
export class DeviceRequestDto implements C.DeviceRequest {
  @ApiProperty({ example: 'ABCD-EFGH' }) userCode: string;
  @ApiProperty({ enum: ['pending', 'approved', 'denied', 'expired'], enumName: 'DeviceStatus' })
  status: C.DeviceStatus;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
  @ApiProperty({ type: DeviceClientDto }) client: DeviceClientDto;
  @ApiProperty({ type: String, nullable: true, example: 'estudio-norte/lideris-v2' })
  repo: string | null;
  @ApiProperty({ type: String, nullable: true }) suggestedProjectId: string | null;
}

@ApiSchema({ name: 'DeviceAuthorization' })
export class DeviceAuthorizationDto implements C.DeviceAuthorization {
  @ApiProperty({ description: 'Secreto de la skill para sondear' }) deviceCode: string;
  @ApiProperty({ example: 'ABCD-EFGH' }) userCode: string;
  @ApiProperty({ example: 'http://localhost:5173/device' }) verificationUri: string;
  @ApiProperty({ example: 'http://localhost:5173/device?code=ABCD-EFGH' })
  verificationUriComplete: string;
  @ApiProperty({ example: 600 }) expiresIn: number;
  @ApiProperty({ example: 5 }) interval: number;
}

@ApiSchema({ name: 'DeviceProject' })
class DeviceProjectDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

@ApiSchema({ name: 'DeviceUser' })
class DeviceUserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

@ApiSchema({ name: 'DeviceGrant' })
export class DeviceGrantDto implements C.DeviceGrant {
  @ApiProperty({ example: 'qa_pat_…', description: 'Solo se entrega una vez' }) secret: string;
  @ApiProperty({ type: ApiTokenDto }) token: ApiTokenDto;
  @ApiProperty({ type: DeviceProjectDto }) project: DeviceProjectDto;
  @ApiProperty({ type: DeviceUserDto }) user: DeviceUserDto;
}

/* ── Skill: configuración y búsqueda ──────────────────────────────── */

@ApiSchema({ name: 'SkillViewport' })
class SkillViewportDto {
  @ApiProperty({ example: 1024 }) min: number;
  @ApiProperty({ example: 1920 }) max: number;
}

@ApiSchema({ name: 'SkillLimits' })
class SkillLimitsDto {
  @ApiProperty({ example: 40 }) maxScreens: number;
  @ApiProperty({ example: 5242880 }) maxBytes: number;
  @ApiProperty({ type: [String], example: ['image/png', 'image/webp'] }) contentTypes: string[];
  @ApiProperty({ type: SkillViewportDto }) viewport: SkillViewportDto;
}

@ApiSchema({ name: 'SkillProject' })
export class SkillProjectDto implements C.SkillProject {
  @ApiProperty({ example: 'lideris' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [String], example: ['[data-private]'] }) maskSelectors: string[];
  @ApiProperty({ type: [String] }) designRules: string[];
  @ApiProperty({ type: SkillLimitsDto }) limits: SkillLimitsDto;
  @ApiProperty({ example: '0.1.0' }) minSkillVersion: string;
}

@ApiSchema({ name: 'SkillReviewRef' })
export class SkillReviewRefDto implements C.SkillReviewRef {
  @ApiProperty({ example: 'QR-0012' }) id: string;
  @ApiProperty({ enum: REVIEW_STATUSES }) status: C.ReviewStatus;
  @ApiProperty() round: number;
  @ApiProperty({ example: 'http://localhost:5173/reviews/QR-0012' }) url: string;
}

/* ── Métricas ─────────────────────────────────────────────────────── */

@ApiSchema({ name: 'DesignerLoad' })
class DesignerLoadDto {
  @ApiProperty() userId: string;
  @ApiProperty() pending: number;
  @ApiProperty() overdue: number;
}

@ApiSchema({ name: 'ModuleChanges' })
class ModuleChangesDto {
  @ApiProperty() module: string;
  @ApiProperty() changes: number;
  @ApiProperty() screens: number;
}

@ApiSchema({ name: 'Weekly' })
class WeeklyDto {
  @ApiProperty({ example: '2026-10-26' }) week: string;
  @ApiProperty() opened: number;
  @ApiProperty() approved: number;
}

@ApiSchema({ name: 'ReportsOverview' })
export class ReportsOverviewDto implements C.ReportsOverview {
  @ApiProperty() open: number;
  @ApiProperty() overdue: number;
  @ApiProperty() hoursToFirstReview: number;
  @ApiProperty() hoursToApproval: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) firstRoundApprovalRate: number;
  @ApiProperty() avgRounds: number;
  @ApiProperty({ type: [DesignerLoadDto] }) pendingByDesigner: DesignerLoadDto[];
  @ApiProperty({ type: [ModuleChangesDto] }) changesByModule: ModuleChangesDto[];
  @ApiProperty({ type: [WeeklyDto] }) weekly: WeeklyDto[];
}
