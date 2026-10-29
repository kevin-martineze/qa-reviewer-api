import type { NotificationFilters } from './notifications.service';
import type { Principal } from '../../shared/auth/principal';
import type { NotificationPrefs } from '../../shared/contract';

import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { NotificationDto, NotificationPrefsDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { notificationListQuerySchema, notificationPrefsSchema } from './notifications.schemas';
import { INBOX_LIMIT, NotificationsService } from './notifications.service';

@ApiTags('Notificaciones')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @Endpoint({
    summary: 'Bandeja de la persona, más recientes primero',
    description: `Sin paginar: las ${INBOX_LIMIT} más recientes. \`unread=true\` solo no leídas; \`mentions=true\` solo menciones.`,
    query: notificationListQuerySchema,
    ok: [NotificationDto],
  })
  list(
    @CurrentPrincipal() principal: Principal,
    @Query(new JoiPipe(notificationListQuerySchema)) query: NotificationFilters,
  ) {
    return this.notifications.list(principal, query);
  }

  @Get('notifications/unread-count')
  @Endpoint({
    summary: 'Cuántas no leídas',
    ok: { type: 'integer', minimum: 0 },
  })
  unreadCount(@CurrentPrincipal() principal: Principal) {
    return this.notifications.unreadCount(principal);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  @Endpoint({ summary: 'Marcar todas como leídas' })
  markAllRead(@CurrentPrincipal() principal: Principal): Promise<void> {
    return this.notifications.markAllRead(principal);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  @Endpoint({
    summary: 'Marcar una como leída',
    errors: { 404: ['notifications.not_found'] },
  })
  markRead(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.notifications.markRead(principal, id);
  }

  @Get('me/notification-prefs')
  @Endpoint({
    summary: 'Qué avisos llegan también por correo',
    description: 'In-app siempre llega. Sin preferencias guardadas, valen las de fábrica.',
    ok: NotificationPrefsDto,
  })
  prefs(@CurrentPrincipal() principal: Principal) {
    return this.notifications.prefs(principal);
  }

  @Put('me/notification-prefs')
  @Endpoint({
    summary: 'Guardar las preferencias de correo',
    description: 'El objeto completo, con todos los tipos.',
    body: notificationPrefsSchema,
    ok: NotificationPrefsDto,
  })
  updatePrefs(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(notificationPrefsSchema)) body: NotificationPrefs,
  ) {
    return this.notifications.updatePrefs(principal, body);
  }
}
