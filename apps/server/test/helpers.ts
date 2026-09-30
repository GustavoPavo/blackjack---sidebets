import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Shoe, type Card, type Rank, type Suit } from '@bj/engine';
import { openDatabase } from '../src/db/sqlite';
import { GameService } from '../src/gameService';
import { SqliteRepository } from '../src/sqliteRepository';

export const c = (code: string): Card => ({ rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit });

export function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'bj-'));
  return { file: join(dir, 'test.sqlite'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Sobe o serviço sobre um arquivo SQLite. `shoe` = baralho fixo para a 1ª mesa (depois do reinício o shoe vem do banco). */
export function boot(file: string, shoe?: string[], Repo: typeof SqliteRepository = SqliteRepository) {
  const db = openDatabase(file);
  const repo = new Repo(db);
  const service = new GameService(repo, {
    tableOptions: shoe ? { shoeFactory: () => Shoe.stacked(shoe.map(c)), reshuffleBelow: 0 } : {},
  });
  return { db, repo, service, close: () => db.close() };
}

let n = 0;
export const cmdId = () => `c${++n}`;
export function run(service: GameService, playerId: string, cmd: Record<string, unknown>) {
  return service.execute(playerId, { id: cmdId(), ...cmd });
}
export function ok(service: GameService, playerId: string, cmd: Record<string, unknown>) {
  const r = run(service, playerId, cmd);
  if (!r.result.ok) throw new Error(`${cmd.type}: ${r.result.code} ${r.result.message}`);
  return r.view;
}
