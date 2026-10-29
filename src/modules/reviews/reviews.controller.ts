import type { ReviewFilters } from './review-query';
import type { Principal } from '../../shared/auth/principal';
import type { Priority } from '../../shared/contract';

import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { ActivityEventDto, ReviewDto, ReviewPageDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import {
  assigneesSchema,
  prioritySchema,
  reopenSchema,
  reviewListQuerySchema,
} from './reviews.schemas';
import { ReviewsService } from './reviews.service';

@ApiTags('Revisiones')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Endpoint({
    summary: 'Revisiones visibles, filtradas y paginadas',
    description:
      '`status` se repite (`status=open&status=in_review`). `overdue=true`: en turno de diseño y con el plazo vencido. `q` busca en id, título, tarjeta, número de PR y módulo.',
    query: reviewListQuerySchema,
    ok: ReviewPageDto,
  })
  list(
    @CurrentPrincipal() principal: Principal,
    @Query(new JoiPipe(reviewListQuerySchema)) query: ReviewFilters,
  ) {
    return this.reviews.list(principal, query);
  }

  @Get(':id')
  @Endpoint({
    summary: 'Una revisión con pantallas, rondas y URLs firmadas (15 min)',
    ok: ReviewDto,
    errors: { 404: ['reviews.not_found'] },
  })
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.reviews.get(principal, id);
  }

  @Get(':id/activity')
  @Endpoint({
    summary: 'Línea de tiempo de la revisión, más reciente primero',
    ok: [ActivityEventDto],
    errors: { 404: ['reviews.not_found'] },
  })
  activity(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.reviews.listActivity(principal, id);
  }

  @Put(':id/assignees')
  @Endpoint({
    summary: 'Asignar la revisión',
    description: 'Diseñadores o líderes de diseño activos del proyecto; nunca el autor.',
    body: assigneesSchema,
    ok: ReviewDto,
    errors: {
      400: ['reviews.invalid_assignees'],
      403: ['auth.forbidden'],
      404: ['reviews.not_found'],
      409: ['reviews.stale_status'],
    },
  })
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(assigneesSchema)) body: { assignees: string[] },
  ) {
    return this.reviews.assign(principal, id, body.assignees);
  }

  @Patch(':id')
  @Endpoint({
    summary: 'Cambiar la prioridad',
    body: prioritySchema,
    ok: ReviewDto,
    errors: {
      403: ['auth.forbidden'],
      404: ['reviews.not_found'],
      409: ['reviews.stale_status'],
    },
  })
  setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(prioritySchema)) body: { priority: Priority },
  ) {
    return this.reviews.setPriority(principal, id, body.priority);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Endpoint({
    summary: 'Reabrir: anula el último envío y vuelve a in_review',
    description: 'Plazo nuevo desde ahora según el SLA del proyecto. Avisa al autor.',
    body: reopenSchema,
    ok: ReviewDto,
    errors: {
      403: ['auth.forbidden'],
      404: ['reviews.not_found'],
      409: ['reviews.stale_status'],
    },
  })
  reopen(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(reopenSchema)) body: { reason: string },
  ) {
    return this.reviews.reopen(principal, id, body.reason);
  }
}
