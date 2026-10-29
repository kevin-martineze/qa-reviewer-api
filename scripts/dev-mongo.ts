// Mongo local para desarrollo (replica set de un nodo, datos en .data/mongo).
// Uso: `pnpm db` en una terminal y `pnpm dev` en otra con
// MONGO_URI=mongodb://127.0.0.1:27017/qa_reviewer?replicaSet=rs0
import { startMemoryMongo } from '../src/config/memory-mongo';

async function main(): Promise<void> {
  const port = Number(process.env.MONGO_PORT ?? 27017);
  const { replSet, uri } = await startMemoryMongo({ port, dbPath: '.data/mongo' });
  console.log(`Mongo listo: ${uri}`);
  const stop = async () => {
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
