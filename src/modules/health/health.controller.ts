import type { Connection } from 'mongoose';

import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../shared/auth/decorators';
import { ApiError } from '../../shared/http/api-error';
import { STORAGE, type StoragePort } from '../../shared/storage/storage.port';

@ApiTags('Salud')
@Public()
@Controller({ path: 'healthcheck', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'El proceso responde' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readiness-probe')
  @ApiOperation({ summary: 'Mongo y el storage responden' })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.connection.db?.admin().ping();
      await this.storage.head('healthcheck/probe');
    } catch {
      throw new ApiError(503, 'health.unavailable', 'Servicio no disponible.');
    }
    return { status: 'ok' };
  }
}
