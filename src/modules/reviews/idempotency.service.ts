import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { badRequest, conflict, unprocessable } from '../../shared/http/api-error';
import { IdempotencyDoc } from '../../shared/schemas';
import { ClockService } from '../../shared/util/clock.service';
import { sha256 } from '../../shared/util/ids';
import { isDuplicateKey } from '../../shared/util/mongo-errors';

import { canonicalJson } from './domain/canonical-json';
import { idempotencyKeySchema } from './manifest.schema';

/**
 * `Idempotency-Key` (docs/patterns.md): la skill reintenta, y el mismo intento no crea dos
 * revisiones ni dos rondas. Misma clave y mismo body → la misma respuesta durante 24 h;
 * misma clave con otro body → 422.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyDoc.name) private readonly records: Model<IdempotencyDoc>,
    private readonly clock: ClockService,
  ) {}

  async run<T>(
    userId: string,
    key: string | undefined,
    scope: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const { value: clean, error } = idempotencyKeySchema.required().validate(key);
    if (error) {
      throw badRequest(
        'idempotency.required',
        'Falta el header Idempotency-Key (8 a 200 caracteres ASCII visibles).',
      );
    }
    const _id = `${userId}:${clean}`;
    const requestHash = sha256(`${scope}\n${canonicalJson(body)}`);

    try {
      await this.records.create({ _id, requestHash, response: null, createdAt: this.clock.now() });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      return this.replay<T>(_id, requestHash);
    }

    try {
      const result = await fn();
      await this.records.updateOne({ _id }, { response: { status: 201, body: result } });
      return result;
    } catch (e) {
      // Un intento fallido no reserva la clave: el reintento vuelve a correr.
      await this.records.deleteOne({ _id });
      throw e;
    }
  }

  private async replay<T>(_id: string, requestHash: string): Promise<T> {
    const record = await this.records.findById(_id).lean();
    if (record && record.requestHash !== requestHash) {
      throw unprocessable(
        'idempotency.mismatch',
        'Esta Idempotency-Key ya se usó con otro contenido. Usa una clave nueva.',
      );
    }
    if (!record?.response) {
      throw conflict(
        'idempotency.in_progress',
        'Este pedido todavía se está procesando. Reintenta en unos segundos.',
      );
    }
    // La respuesta guardada es la misma que se entregó: se devuelve tal cual (borde con Mongo).
    return record.response.body as T;
  }
}
