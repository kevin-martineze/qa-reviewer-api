import type { Principal } from '../../shared/auth/principal';

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AllowApiToken, CurrentPrincipal } from '../../shared/auth/decorators';
import { SkillProjectDto, SkillReviewRefDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { prQuerySchema } from './reviews.schemas';
import { SkillLookupService } from './skill-lookup.service';

@ApiTags('Skill')
@Controller('skill')
export class SkillLookupController {
  constructor(private readonly lookup: SkillLookupService) {}

  @Get('project')
  @AllowApiToken()
  @Endpoint({
    summary: 'Configuración del proyecto del token para capturar',
    description:
      'Selectores a tapar, reglas de diseño, límites del manifiesto y `minSkillVersion`. Solo con token `qa_pat_`.',
    ok: SkillProjectDto,
    errors: { 400: ['skill.token_required'], 404: ['projects.not_found'] },
  })
  project(@CurrentPrincipal() principal: Principal) {
    return this.lookup.project(principal);
  }

  @Get('reviews')
  @AllowApiToken()
  @Endpoint({
    summary: 'La revisión vigente de un PR',
    description:
      'La más reciente del PR en el proyecto del token, sin vencidas ni borradores de otra persona. Solo con token `qa_pat_`.',
    query: prQuerySchema,
    ok: SkillReviewRefDto,
    errors: { 400: ['skill.token_required'], 404: ['reviews.not_found'] },
  })
  byPr(
    @CurrentPrincipal() principal: Principal,
    @Query(new JoiPipe(prQuerySchema)) query: { pr: number },
  ) {
    return this.lookup.byPr(principal, query.pr);
  }
}
