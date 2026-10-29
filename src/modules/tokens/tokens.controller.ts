import type { Principal } from '../../shared/auth/principal';

import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { ApiTokenDto, CreatedTokenDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { newTokenSchema } from './tokens.schemas';
import { TokensService } from './tokens.service';

@ApiTags('Tokens de la skill')
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  @Get()
  @Endpoint({
    summary: 'Mis tokens vigentes, más recientes primero',
    description: 'Solo el prefijo: el valor completo se entrega una vez, al crearlo.',
    ok: [ApiTokenDto],
  })
  list(@CurrentPrincipal() principal: Principal) {
    return this.tokens.list(principal);
  }

  @Post()
  @Endpoint({
    summary: 'Crear un token para un proyecto',
    description: 'Requiere `tokens:own` en el proyecto. `secret` no se vuelve a entregar.',
    body: newTokenSchema,
    ok: CreatedTokenDto,
    status: 201,
    errors: { 403: ['auth.forbidden'], 404: ['projects.not_found'] },
  })
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(newTokenSchema)) body: { projectId: string; label: string },
  ) {
    return this.tokens.create(principal, body.projectId, body.label);
  }

  @Delete(':id')
  @HttpCode(204)
  @Endpoint({
    summary: 'Revocar uno de mis tokens',
    description: 'Deja de servir de inmediato.',
    errors: { 404: ['tokens.not_found'] },
  })
  revoke(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.tokens.revoke(principal, id);
  }
}
