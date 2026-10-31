import type { DeviceStart } from './device.service';
import type { Principal } from '../../shared/auth/principal';
import type { FastifyRequest } from 'fastify';

import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal, Public } from '../../shared/auth/decorators';
import {
  DeviceAuthorizationDto,
  DeviceGrantDto,
  DeviceRequestDto,
} from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { approveDeviceSchema, pollDeviceSchema, startDeviceSchema } from './device.schemas';
import { DeviceService } from './device.service';

const DEVICE_ERRORS = {
  404: ['device.not_found'],
  409: ['device.used'],
  410: ['device.expired'],
  429: ['device.rate_limited'],
};

/** Lo que llama la skill, sin sesión. */
@ApiTags('Login de la skill')
@Controller('skill/device')
export class SkillDeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Post()
  @Public()
  @Endpoint({
    public: true,
    summary: 'Pedir acceso desde la skill',
    description:
      'Devuelve el código que la persona aprueba en `verificationUriComplete` y el `deviceCode` para sondear. Vence a los 10 min. Máximo 10 por minuto por IP.',
    body: startDeviceSchema,
    ok: DeviceAuthorizationDto,
    status: 201,
    errors: { 429: ['device.rate_limited'] },
  })
  start(@Req() request: FastifyRequest, @Body(new JoiPipe(startDeviceSchema)) body: DeviceStart) {
    return this.devices.start(body, request.ip);
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  @Endpoint({
    public: true,
    summary: 'Sondear hasta recibir el token',
    description:
      'Cada `interval` segundos. Aprobado: crea el token y lo entrega una sola vez (`secret`). Los errores siguen el RFC 8628: `device.pending` sigue esperando, `device.slow_down` pide 5 s más.',
    body: pollDeviceSchema,
    ok: DeviceGrantDto,
    errors: {
      400: ['device.pending'],
      403: ['device.denied'],
      404: ['device.not_found'],
      409: ['device.used'],
      410: ['device.expired'],
      429: ['device.slow_down'],
    },
  })
  poll(@Body(new JoiPipe(pollDeviceSchema)) body: { deviceCode: string }) {
    return this.devices.poll(body.deviceCode);
  }
}

/** Lo que llama la web con la sesión de la persona. */
@ApiTags('Login de la skill')
@Controller('device')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Get(':userCode')
  @Endpoint({
    summary: 'Ver una solicitud de acceso',
    description: 'El código no distingue mayúsculas y el guion es opcional.',
    ok: DeviceRequestDto,
    errors: { 404: ['device.not_found'], 429: ['device.rate_limited'] },
  })
  get(@CurrentPrincipal() principal: Principal, @Param('userCode') userCode: string) {
    return this.devices.get(principal, userCode);
  }

  @Post(':userCode/approve')
  @HttpCode(200)
  @Endpoint({
    summary: 'Aprobar el acceso para un proyecto',
    description:
      'Requiere `tokens:own` en el proyecto. El token se crea cuando la skill sondea; sin `label` se llama «Claude Code · <hostname>».',
    body: approveDeviceSchema,
    ok: DeviceRequestDto,
    errors: {
      ...DEVICE_ERRORS,
      403: ['auth.forbidden'],
      404: ['device.not_found', 'projects.not_found'],
    },
  })
  approve(
    @CurrentPrincipal() principal: Principal,
    @Param('userCode') userCode: string,
    @Body(new JoiPipe(approveDeviceSchema)) body: { projectId: string; label?: string },
  ) {
    return this.devices.approve(principal, userCode, body.projectId, body.label);
  }

  @Post(':userCode/deny')
  @HttpCode(204)
  @Endpoint({ summary: 'Rechazar el acceso', errors: DEVICE_ERRORS })
  deny(
    @CurrentPrincipal() principal: Principal,
    @Param('userCode') userCode: string,
  ): Promise<void> {
    return this.devices.deny(principal, userCode);
  }
}
