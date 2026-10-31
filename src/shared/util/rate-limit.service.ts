import type { Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { RateLimitDoc } from '../schemas';

import { ClockService } from './clock.service';

/**
 * Límites de uso con ventanas fijas en Mongo: un documento por clave y ventana, que el TTL
 * borra al terminar. Sirve igual con una o varias máquinas.
 */
@Injectable()
export class RateLimitService {
  constructor(
    @InjectModel(RateLimitDoc.name) private readonly limits: Model<RateLimitDoc>,
    private readonly clock: ClockService,
  ) {}

  private window(key: string, windowMs: number) {
    const start = Math.floor(this.clock.now().getTime() / windowMs) * windowMs;
    return { id: `${key}:${start}`, expiresAt: new Date(start + windowMs) };
  }

  /** Suma un uso y dice si sigue dentro del límite. */
  async hit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const { id, expiresAt } = this.window(key, windowMs);
    const doc = await this.limits
      .findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      )
      .lean();
    return (doc?.count ?? 0) <= limit;
  }

  /** ¿Ya se llegó al límite en la ventana actual? No suma. */
  async reached(key: string, limit: number, windowMs: number): Promise<boolean> {
    const doc = await this.limits.findById(this.window(key, windowMs).id).lean();
    return (doc?.count ?? 0) >= limit;
  }
}
