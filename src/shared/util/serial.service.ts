import type { ClientSession, Model } from 'mongoose';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { CounterDoc } from '../schemas';

/** Seriales que nunca se reutilizan: `QR-0001`, `QR-0002`… (ADR 0010). */
@Injectable()
export class SerialService {
  constructor(@InjectModel(CounterDoc.name) private readonly counters: Model<CounterDoc>) {}

  async next(name: string, prefix: string, session?: ClientSession): Promise<string> {
    const counter = await this.counters.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    return `${prefix}-${String(counter.seq).padStart(4, '0')}`;
  }

  /** Lleva el contador al menos hasta `seq` (la semilla trae revisiones con número). */
  async ensureAtLeast(name: string, seq: number): Promise<void> {
    await this.counters.updateOne({ _id: name }, { $max: { seq } }, { upsert: true });
  }
}
