import type { Manifest } from './domain/manifest';
import type { Principal } from '../../shared/auth/principal';

import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';

import { AllowApiToken, CurrentPrincipal } from '../../shared/auth/decorators';
import { DraftDto, FeedbackStatusDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { manifestSchema } from './manifest.schema';
import { SkillService } from './skill.service';

const IDEMPOTENCY_HEADER = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'Una por intento lógico. Misma clave y mismo body → misma respuesta durante 24 h.',
});

const MANIFEST_ERRORS = {
  400: ['idempotency.required'],
  403: ['auth.forbidden', 'manifest.project_mismatch'],
  409: ['idempotency.in_progress'],
  422: [
    'idempotency.mismatch',
    'manifest.version_unsupported',
    'manifest.privacy_required',
    'manifest.too_many_screens',
    'manifest.invalid_capture',
    'manifest.viewport',
    'manifest.duplicate_screens',
  ],
};

@ApiTags('Skill')
@Controller('reviews')
export class SkillController {
  constructor(private readonly skill: SkillService) {}

  @Post()
  @AllowApiToken()
  @IDEMPOTENCY_HEADER
  @Endpoint({
    summary: 'Crear una revisión desde el manifiesto (ronda 1, borrador)',
    description:
      'Responde las URLs firmadas para subir cada captura (PUT, 15 min). Si el PR ya tiene un borrador propio, lo reemplaza; si tiene una revisión publicada, 409 `reviews.exists` con `details.reviewId`.',
    body: manifestSchema,
    ok: DraftDto,
    status: 201,
    errors: {
      ...MANIFEST_ERRORS,
      404: ['projects.not_found'],
      409: [...MANIFEST_ERRORS[409], 'reviews.exists'],
    },
  })
  create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new JoiPipe(manifestSchema)) body: Manifest,
  ) {
    return this.skill.create(principal, key, body);
  }

  @Post(':id/rounds')
  @AllowApiToken()
  @IDEMPOTENCY_HEADER
  @Endpoint({
    summary: 'Subir una ronda nueva (mismo PR)',
    description:
      'Solo después de un envío de diseño. Pide subir solo las pantallas nuevas o con otro hash; las demás heredan su veredicto.',
    body: manifestSchema,
    ok: DraftDto,
    status: 201,
    errors: {
      ...MANIFEST_ERRORS,
      404: ['reviews.not_found'],
      409: [...MANIFEST_ERRORS[409], 'reviews.stale_status'],
      422: [
        ...MANIFEST_ERRORS[422],
        'manifest.pr_mismatch',
        'manifest.review_mismatch',
        'manifest.no_changes',
      ],
    },
  })
  addRound(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new JoiPipe(manifestSchema)) body: Manifest,
  ) {
    return this.skill.addRound(principal, id, key, body);
  }

  @Post(':id/publish')
  @AllowApiToken()
  @HttpCode(200)
  @Endpoint({
    summary: 'Publicar la ronda subida',
    description:
      'Verifica que cada captura exista con el tipo y tamaño declarados, asigna según la estrategia del proyecto y fija el plazo. Repetirlo no tiene efectos.',
    ok: DraftDto,
    errors: {
      403: ['auth.forbidden'],
      404: ['reviews.not_found'],
      409: ['reviews.stale_status'],
      422: ['reviews.missing_uploads'],
    },
  })
  publish(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.skill.publish(principal, id);
  }

  @Get(':id/feedback')
  @AllowApiToken()
  @Endpoint({
    summary: 'Feedback de la última ronda enviada, en texto para la sesión',
    ok: FeedbackStatusDto,
    errors: { 404: ['reviews.not_found'] },
  })
  feedback(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.skill.feedback(principal, id);
  }
}
