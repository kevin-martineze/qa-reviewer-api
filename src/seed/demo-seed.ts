import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { getConnectionToken } from '@nestjs/mongoose';

/** Borra la base y la deja lista para cargar la demo. */
export async function seedDemo(app: INestApplication): Promise<void> {
  const connection = app.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await connection.syncIndexes();
}
