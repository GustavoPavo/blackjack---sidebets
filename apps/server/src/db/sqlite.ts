import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { migrate, type Migration, MIGRATIONS } from './migrations';

// O módulo node:sqlite ainda emite um aviso "experimental"; silenciamos apenas esse aviso.
const originalEmit = process.emitWarning.bind(process) as (...a: unknown[]) => void;
process.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
  if (typeof warning === 'string' && /SQLite/i.test(warning)) return;
  originalEmit(warning, ...rest);
}) as typeof process.emitWarning;

const nodeRequire = createRequire(import.meta.url);

/** Abre (criando se preciso) o banco SQLite e aplica as migrações pendentes. */
export function openDatabase(path: string, migrations: Migration[] = MIGRATIONS): DatabaseSync {
  let sqlite: typeof import('node:sqlite');
  try {
    sqlite = nodeRequire('node:sqlite');
  } catch {
    throw new Error('Este servidor usa o módulo node:sqlite, disponível a partir do Node.js 22.5 (recomendado 22.13+). Atualize o Node.js.');
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new sqlite.DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = FULL'); // carteiras: preferimos durabilidade a velocidade
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db, migrations);
  return db;
}
