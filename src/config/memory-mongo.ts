import { mkdir } from 'node:fs/promises';

import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Mongo de desarrollo sin instalar nada: un replica set de un nodo (las transacciones lo
 * necesitan). Con `dbPath` los datos sobreviven entre reinicios; sin él, son efímeros.
 */
export async function startMemoryMongo(options: { port?: number; dbPath?: string } = {}) {
  if (options.dbPath) await mkdir(options.dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: options.port, dbPath: options.dbPath }],
  });
  await replSet.waitUntilRunning();
  return { replSet, uri: replSet.getUri('qa_reviewer') };
}
