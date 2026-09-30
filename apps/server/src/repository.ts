import type { Card, KindStats, LedgerEntry, PlayerStats, RoundHistoryEntry } from '@bj/engine';

export interface PersistedPlayer { id: string; name: string; balance: number; ledger: LedgerEntry[] }

export interface RoundRecord {
  epoch: number;
  tableRound: number;
  settledAt: string;
  dealerCards: Card[];
  hands: { playerId: string; seat: number; handIndex: number; cards: Card[]; bet: number; doubled: boolean; fromSplit: boolean; status: string }[];
  results: { playerId: string; seat: number; handIndex: number | null; kind: string; stake: number; payout: number; net: number; outcome: string; label: string }[];
}

export interface TableStateRow { epoch: number; lastRecordedRound: number; json: string }

export type { KindStats, PlayerStats, RoundHistoryEntry };

/**
 * Camada de acesso a dados. O jogo só conhece esta interface: trocar SQLite por outro banco
 * (ex.: PostgreSQL) significa escrever outra implementação, sem mexer no motor nem nas rotas.
 * `transaction` executa `fn` de forma atômica: se lançar, nada é gravado.
 */
export interface GameRepository {
  transaction<T>(fn: () => T): T;

  loadPlayers(): PersistedPlayer[];
  savePlayer(p: { id: string; name: string; balance: number }, now: string): void;
  addLedgerEntry(playerId: string, entry: LedgerEntry): void;

  createSession(tokenHash: string, playerId: string, now: string): void;
  findSession(tokenHash: string): { playerId: string; lastSeenAt: string } | null;
  touchSession(tokenHash: string, now: string): void;
  revokeSession(tokenHash: string, now: string): void;

  hasProcessed(playerId: string, commandId: string): boolean;
  putProcessed(playerId: string, commandId: string, type: string, now: string): void;
  pruneProcessed(olderThanIso: string): number;

  loadTableState(): TableStateRow | null;
  saveTableState(row: TableStateRow, now: string): void;

  getPreferences(playerId: string): unknown | null;
  savePreferences(playerId: string, json: string, now: string): void;

  /** Registra a rodada liquidada. Idempotente por (epoch, tableRound). Retorna o id ou null se já existia. */
  recordRound(r: RoundRecord): number | null;
  getStats(playerId: string): PlayerStats;
  getHistory(playerId: string, limit: number): RoundHistoryEntry[];

  close(): void;
}
