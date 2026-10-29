import type { FastifyReply, FastifyRequest } from 'fastify';

import { Controller, Get, Inject, Put, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../auth/decorators';
import { forbidden, notFound, unprocessable } from '../http/api-error';

import { LocalStorage } from './local.storage';
import { STORAGE, type StoragePort } from './storage.port';

type Query = Record<string, string | undefined>;

/** Sirve las URLs firmadas del storage local. Con `STORAGE_DRIVER=s3` responde 404. */
@ApiExcludeController()
@Public()
@Controller('storage')
export class StorageController {
  constructor(@Inject(STORAGE) private readonly storage: StoragePort) {}

  @Get('*')
  async get(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const local = this.local();
    const key = keyOf(req);
    if (!local.verify('GET', key, req.query as Query)) {
      throw forbidden('storage.invalid_signature', 'El enlace venció o no es válido.');
    }
    const object = await local.read(key);
    if (!object) throw notFound('storage.not_found', 'El archivo no existe.');
    await reply
      .header('content-type', object.contentType)
      .header('cache-control', 'private, max-age=900')
      .send(object.body);
  }

  @Put('*')
  async put(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const local = this.local();
    const key = keyOf(req);
    const query = req.query as Query;
    if (!local.verify('PUT', key, query)) {
      throw forbidden('storage.invalid_signature', 'El enlace venció o no es válido.');
    }
    const body = req.body;
    if (!Buffer.isBuffer(body)) throw unprocessable('storage.empty', 'El archivo está vacío.');
    const type = req.headers['content-type'];
    if (!type || type !== query.ct || body.length !== Number(query.len)) {
      throw unprocessable(
        'storage.mismatch',
        'El tipo o el tamaño del archivo no coinciden con lo declarado.',
      );
    }
    await local.put(key, body, type);
    await reply.status(200).send();
  }

  private local(): LocalStorage {
    if (!(this.storage instanceof LocalStorage)) {
      throw notFound('common.not_found', 'No encontramos este recurso.');
    }
    return this.storage;
  }
}

function keyOf(req: FastifyRequest): string {
  const params = req.params as Record<string, string | undefined>;
  return decodeURIComponent(params['*'] ?? '');
}
