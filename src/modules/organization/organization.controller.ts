import type { UserChange } from './domain/user-change';
import type { AuditQuery, NewInvitation } from './organization.service';
import type { Principal } from '../../shared/auth/principal';

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import {
  AuditPageDto,
  InvitationDto,
  OrganizationDto,
  UserDto,
} from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { auditQuerySchema, invitationSchema, userPatchSchema } from './organization.schemas';
import { OrganizationService } from './organization.service';

@ApiTags('Organización')
@Controller()
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  @Get('organization')
  @Endpoint({ summary: 'Organización de la instalación', ok: OrganizationDto })
  organization() {
    return this.org.organization();
  }

  @Get('users')
  @Endpoint({
    summary: 'Personas de la organización',
    description: 'El shell de la web la pide en cada página para nombres y avatares.',
    ok: [UserDto],
  })
  listUsers() {
    return this.org.listUsers();
  }

  @Patch('users/:id')
  @Endpoint({
    summary: 'Cambiar el estado o el rol de organización de una persona',
    description:
      'Exactamente uno de `status` u `orgRole`. Desactivar cierra sus sesiones y revoca sus tokens. Dar el rol owner exige `org:manage`.',
    body: userPatchSchema,
    ok: UserDto,
    errors: {
      403: ['auth.forbidden'],
      404: ['users.not_found'],
      409: ['users.self', 'users.owner', 'users.changed'],
    },
  })
  updateUser(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(userPatchSchema)) body: UserChange,
  ) {
    return this.org.updateUser(principal, id, body);
  }

  @Get('invitations')
  @Endpoint({
    summary: 'Invitaciones con su estado calculado',
    ok: [InvitationDto],
    errors: { 403: ['auth.forbidden'] },
  })
  listInvitations(@CurrentPrincipal() principal: Principal) {
    return this.org.listInvitations(principal);
  }

  @Post('invitations')
  @Endpoint({
    summary: 'Invitar a una persona',
    description:
      'Envía el correo con el enlace (vence en 7 días). Invitar como owner exige `org:manage`.',
    body: invitationSchema,
    ok: InvitationDto,
    status: 201,
    errors: {
      400: ['invite.invalid_projects'],
      403: ['auth.forbidden'],
      409: ['users.exists', 'invite.pending'],
    },
  })
  invite(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(invitationSchema)) body: NewInvitation,
  ) {
    return this.org.invite(principal, body);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @Endpoint({
    summary: 'Revocar una invitación',
    errors: { 403: ['auth.forbidden'], 404: ['invite.not_found'] },
  })
  revokeInvitation(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.org.revokeInvitation(principal, id);
  }

  @Get('audit')
  @Endpoint({
    summary: 'Registro de auditoría, más reciente primero',
    query: auditQuerySchema,
    ok: AuditPageDto,
    errors: { 403: ['auth.forbidden'] },
  })
  audit(
    @CurrentPrincipal() principal: Principal,
    @Query(new JoiPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    return this.org.listAudit(principal, query);
  }
}
