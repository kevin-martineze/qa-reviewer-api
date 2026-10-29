import type { NewComment } from './feedback.service';
import type { Principal } from '../../shared/auth/principal';
import type { FollowUp, Verdict } from '../../shared/contract';

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { CommentDto, CommentReplyDto, ReviewDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import {
  followUpSchema,
  newCommentSchema,
  replySchema,
  resolveSchema,
  submitSchema,
  verdictSchema,
} from './feedback.schemas';
import { FeedbackService } from './feedback.service';

const FEEDBACK_ERRORS = {
  403: ['auth.forbidden', 'verdicts.author_forbidden'],
  404: ['reviews.not_found', 'screens.not_found'],
  409: ['reviews.stale_status', 'reviews.already_submitted'],
};

@ApiTags('Feedback')
@Controller('reviews')
export class ReviewFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Put(':id/screens/:key/verdict')
  @Endpoint({
    summary: 'Veredicto de una pantalla',
    description:
      'Requiere `verdicts:set` y no ser el autor. El primer veredicto pasa la revisión de `open` a `in_review`. Reemplaza al heredado (`inherited: false`).',
    body: verdictSchema,
    ok: ReviewDto,
    errors: FEEDBACK_ERRORS,
  })
  setVerdict(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body(new JoiPipe(verdictSchema)) body: { verdict: Verdict },
  ) {
    return this.feedback.setVerdict(principal, id, key, body.verdict);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Endpoint({
    summary: 'Enviar la ronda',
    description:
      'Todas las pantallas con veredicto. Con alguna «con ajuste» queda `changes_requested`; si no, `approved`. Marca el check del PR, avisa al autor y publica `ReviewSubmitted`. Aplica desde `open` (veredictos heredados) o `in_review`.',
    body: submitSchema,
    ok: ReviewDto,
    errors: {
      ...FEEDBACK_ERRORS,
      409: [...FEEDBACK_ERRORS[409], 'reviews.pending_screens'],
    },
  })
  submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(submitSchema)) body: { body: string | null },
  ) {
    return this.feedback.submit(principal, id, body.body);
  }

  @Get(':id/comments')
  @Endpoint({
    summary: 'Comentarios de la revisión, del más antiguo al más reciente',
    ok: [CommentDto],
    errors: { 404: ['reviews.not_found'] },
  })
  comments(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.feedback.list(principal, id);
  }

  @Get(':id/screens/:key/comments')
  @Endpoint({
    summary: 'Comentarios de una pantalla',
    ok: [CommentDto],
    errors: { 404: ['reviews.not_found'] },
  })
  screenComments(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('key') key: string,
  ) {
    return this.feedback.list(principal, id, key);
  }

  @Post(':id/screens/:key/comments')
  @Endpoint({
    summary: 'Comentar una pantalla',
    description:
      '`anchor` en fracciones 0–1 de la captura; `el` es el elemento elegido. `@nombre` o `@usuario-del-correo` notifica a esa persona si ve el proyecto.',
    body: newCommentSchema,
    ok: CommentDto,
    status: 201,
    errors: {
      403: ['auth.forbidden'],
      404: ['reviews.not_found', 'screens.not_found'],
      409: ['reviews.stale_status'],
    },
  })
  addComment(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body(new JoiPipe(newCommentSchema)) body: NewComment,
  ) {
    return this.feedback.add(principal, id, key, body);
  }
}

@ApiTags('Feedback')
@Controller('comments')
export class CommentsController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post(':id/replies')
  @Endpoint({
    summary: 'Responder un comentario',
    body: replySchema,
    ok: CommentReplyDto,
    status: 201,
    errors: {
      403: ['auth.forbidden'],
      404: ['comments.not_found'],
      409: ['reviews.stale_status'],
    },
  })
  reply(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(replySchema)) body: { body: string },
  ) {
    return this.feedback.reply(principal, id, body.body);
  }

  @Patch(':id')
  @Endpoint({
    summary: 'Resolver o reabrir un comentario',
    description: 'Su autor o quien tenga `comments:resolve`.',
    body: resolveSchema,
    ok: CommentDto,
    errors: { 403: ['comments.forbidden'], 404: ['comments.not_found'] },
  })
  resolve(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(resolveSchema)) body: { resolved: boolean },
  ) {
    return this.feedback.resolve(principal, id, body.resolved);
  }

  @Put(':id/follow-up')
  @Endpoint({
    summary: '¿Quedó resuelto en esta ronda?',
    description:
      'Solo comentarios de rondas anteriores. `resolved` lo marca resuelto; `still` lo deja abierto.',
    body: followUpSchema,
    ok: CommentDto,
    errors: {
      403: ['auth.forbidden'],
      404: ['comments.not_found'],
      409: ['comments.not_previous_round'],
    },
  })
  followUp(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(followUpSchema)) body: { followUp: Exclude<FollowUp, null> },
  ) {
    return this.feedback.setFollowUp(principal, id, body.followUp);
  }

  @Delete(':id')
  @HttpCode(204)
  @Endpoint({
    summary: 'Borrar un comentario',
    description: 'Su autor o quien tenga `comments:moderate`.',
    errors: { 403: ['comments.forbidden'], 404: ['comments.not_found'] },
  })
  remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.feedback.remove(principal, id);
  }
}
