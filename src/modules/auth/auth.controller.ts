import type { Principal } from '../../shared/auth/principal';
import type { AcceptInviteInput, ProfileInput } from '../../shared/contract';
import type { FastifyRequest } from 'fastify';

import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal, Public } from '../../shared/auth/decorators';
import {
  InviteInfoDto,
  LoginResultDto,
  RecoveryInfoDto,
  SessionUserDto,
} from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import {
  acceptInviteSchema,
  changePasswordSchema,
  loginSchema,
  profileSchema,
  recoveryRequestSchema,
  resetPasswordSchema,
} from './auth.schemas';
import { AuthService } from './auth.service';

const userAgent = (req: FastifyRequest) => req.headers['user-agent'] ?? null;

@ApiTags('Sesión y cuenta')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  @Endpoint({
    summary: 'Iniciar sesión',
    public: true,
    body: loginSchema,
    ok: LoginResultDto,
    errors: { 401: ['auth.invalid'] },
  })
  login(
    @Body(new JoiPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: FastifyRequest,
  ) {
    return this.auth.login(body.email, body.password, userAgent(req));
  }

  @Post('auth/logout')
  @HttpCode(204)
  @Endpoint({ summary: 'Cerrar esta sesión' })
  logout(@CurrentPrincipal() principal: Principal) {
    return this.auth.logout(principal);
  }

  @Post('auth/logout-all')
  @HttpCode(204)
  @Endpoint({
    summary: 'Cerrar sesión en todos los dispositivos (no revoca los tokens de la skill)',
  })
  logoutAll(@CurrentPrincipal() principal: Principal) {
    return this.auth.logoutEverywhere(principal);
  }

  @Public()
  @Post('auth/recovery')
  @HttpCode(204)
  @Endpoint({
    summary: 'Pedir enlace de recuperación',
    description: 'Siempre 204, exista o no el correo.',
    public: true,
    body: recoveryRequestSchema,
  })
  requestRecovery(@Body(new JoiPipe(recoveryRequestSchema)) body: { email: string }) {
    return this.auth.requestRecovery(body.email);
  }

  @Public()
  @Get('auth/recovery/:token')
  @Endpoint({
    summary: 'Estado de un enlace de recuperación',
    public: true,
    ok: RecoveryInfoDto,
    errors: { 404: ['recovery.not_found'] },
  })
  recoveryInfo(@Param('token') token: string) {
    return this.auth.recoveryInfo(token);
  }

  @Public()
  @Post('auth/recovery/:token')
  @HttpCode(204)
  @Endpoint({
    summary: 'Definir contraseña nueva con el enlace',
    public: true,
    body: resetPasswordSchema,
    errors: { 404: ['recovery.not_found'], 410: ['recovery.gone'] },
  })
  resetPassword(
    @Param('token') token: string,
    @Body(new JoiPipe(resetPasswordSchema)) body: { password: string },
  ) {
    return this.auth.resetPassword(token, body.password);
  }

  @Public()
  @Get('invitations/:token')
  @Endpoint({
    summary: 'Datos de una invitación',
    public: true,
    ok: InviteInfoDto,
    errors: { 404: ['invite.not_found'] },
  })
  inviteInfo(@Param('token') token: string) {
    return this.auth.inviteInfo(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(200)
  @Endpoint({
    summary: 'Aceptar una invitación y crear la cuenta',
    public: true,
    body: acceptInviteSchema,
    ok: LoginResultDto,
    errors: {
      404: ['invite.not_found'],
      409: ['users.exists'],
      410: ['invite.expired', 'invite.used', 'invite.revoked'],
    },
  })
  acceptInvite(
    @Param('token') token: string,
    @Body(new JoiPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: FastifyRequest,
  ) {
    return this.auth.acceptInvite(token, body, userAgent(req));
  }

  @Get('me')
  @Endpoint({ summary: 'Usuario de la sesión con sus membresías', ok: SessionUserDto })
  me(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal);
  }

  @Patch('me')
  @Endpoint({ summary: 'Actualizar nombre y avatar', body: profileSchema, ok: SessionUserDto })
  updateProfile(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(profileSchema)) body: ProfileInput,
  ) {
    return this.auth.updateProfile(principal, body);
  }

  @Put('me/password')
  @HttpCode(204)
  @Endpoint({
    summary: 'Cambiar la contraseña',
    description: 'Cierra las demás sesiones.',
    body: changePasswordSchema,
    errors: { 400: ['auth.wrong_password', 'auth.same_password'] },
  })
  changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(changePasswordSchema)) body: { current: string; next: string },
  ) {
    return this.auth.changePassword(principal, body.current, body.next);
  }
}
