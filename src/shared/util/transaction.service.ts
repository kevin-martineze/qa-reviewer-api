import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

/** Corre `fn` en una transacción (requiere replica set; el Mongo de desarrollo lo es). */
@Injectable()
export class TransactionService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      // withTransaction solo termina sin lanzar si `fn` corrió completa.
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
