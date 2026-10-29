import type { ReportsQuery } from './reports.service';
import type { Principal } from '../../shared/auth/principal';

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { ReportsOverviewDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { reportsQuerySchema } from './reports.schemas';
import { ReportsService } from './reports.service';

@ApiTags('Métricas')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @Endpoint({
    summary: 'Resumen de métricas de diseño',
    description:
      'Con `project`, requiere `reports:view` en ese proyecto; sin él, owner o admin y todos los proyectos. `from` y `to` filtran por la fecha de publicación. Ver docs/algorithms.md, Métricas.',
    query: reportsQuerySchema,
    ok: ReportsOverviewDto,
    errors: { 403: ['auth.forbidden'], 404: ['projects.not_found'] },
  })
  overview(
    @CurrentPrincipal() principal: Principal,
    @Query(new JoiPipe(reportsQuerySchema)) query: ReportsQuery,
  ) {
    return this.reports.overview(principal, query);
  }
}
