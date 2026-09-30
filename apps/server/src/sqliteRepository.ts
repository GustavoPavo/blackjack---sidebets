import type { DatabaseSync } from 'node:sqlite';
import type { Card, LedgerEntry, PlayerStats, ResultKind, RoundHistoryEntry } from '@bj/engine';
import type { GameRepository, PersistedPlayer, RoundRecord, TableStateRow } from './repository';

type Row = Record<string, any>;
const KINDS: ResultKind[] = ['main', 'twentyThree', 'pairs', 'buster', 'insurance'];

export class SqliteRepository implements GameRepository {
  private depth = 0;
  constructor(private db: DatabaseSync) {}

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn(); // reentrante: participa da transação externa
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth--;
    }
  }

  // ---- jogadores e carteira
  loadPlayers(): PersistedPlayer[] {
    const players = this.db.prepare('SELECT id, name, balance FROM players ORDER BY created_at, id').all() as Row[];
    const ledger = this.db.prepare('SELECT command_id, type, amount, balance_after, at FROM ledger_entries WHERE player_id = ? ORDER BY rowid');
    return players.map((p) => ({
      id: p.id, name: p.name, balance: p.balance,
      ledger: (ledger.all(p.id) as Row[]).map((l): LedgerEntry => ({
        commandId: l.command_id, type: l.type, amount: l.amount, balanceAfter: l.balance_after, at: l.at,
      })),
    }));
  }
  savePlayer(p: { id: string; name: string; balance: number }, now: string) {
    this.db.prepare(`
      INSERT INTO players (id, name, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, balance = excluded.balance, updated_at = excluded.updated_at
    `).run(p.id, p.name, p.balance, now, now);
  }
  addLedgerEntry(playerId: string, e: LedgerEntry) {
    // INSERT OR IGNORE: a mesma entrada de crédito nunca é registrada duas vezes
    this.db.prepare('INSERT OR IGNORE INTO ledger_entries (player_id, command_id, type, amount, balance_after, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(playerId, e.commandId, e.type, e.amount, e.balanceAfter, e.at);
  }

  // ---- sessões
  createSession(tokenHash: string, playerId: string, now: string) {
    this.db.prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(tokenHash, playerId, now, now);
  }
  findSession(tokenHash: string) {
    const r = this.db.prepare('SELECT player_id, last_seen_at FROM sessions WHERE token_hash = ? AND revoked_at IS NULL').get(tokenHash) as Row | undefined;
    return r ? { playerId: r.player_id as string, lastSeenAt: r.last_seen_at as string } : null;
  }
  touchSession(tokenHash: string, now: string) {
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash);
  }
  revokeSession(tokenHash: string, now: string) {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, tokenHash);
  }

  // ---- idempotência
  hasProcessed(playerId: string, commandId: string) {
    return !!this.db.prepare('SELECT 1 FROM processed_commands WHERE player_id = ? AND command_id = ?').get(playerId, commandId);
  }
  putProcessed(playerId: string, commandId: string, type: string, now: string) {
    this.db.prepare('INSERT OR IGNORE INTO processed_commands (player_id, command_id, type, at) VALUES (?, ?, ?, ?)').run(playerId, commandId, type, now);
  }
  pruneProcessed(olderThanIso: string) {
    return Number(this.db.prepare('DELETE FROM processed_commands WHERE at < ?').run(olderThanIso).changes);
  }

  // ---- estado da mesa
  loadTableState(): TableStateRow | null {
    const r = this.db.prepare('SELECT epoch, last_recorded_round, json FROM table_state WHERE id = 1').get() as Row | undefined;
    return r ? { epoch: r.epoch, lastRecordedRound: r.last_recorded_round, json: r.json } : null;
  }
  saveTableState(row: TableStateRow, now: string) {
    this.db.prepare(`
      INSERT INTO table_state (id, epoch, last_recorded_round, json, updated_at) VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET epoch = excluded.epoch, last_recorded_round = excluded.last_recorded_round,
        json = excluded.json, updated_at = excluded.updated_at
    `).run(row.epoch, row.lastRecordedRound, row.json, now);
  }

  // ---- preferências
  getPreferences(playerId: string) {
    const r = this.db.prepare('SELECT json FROM preferences WHERE player_id = ?').get(playerId) as Row | undefined;
    return r ? JSON.parse(r.json as string) : null;
  }
  savePreferences(playerId: string, json: string, now: string) {
    this.db.prepare(`
      INSERT INTO preferences (player_id, json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
    `).run(playerId, json, now);
  }

  // ---- rodadas, estatísticas e histórico
  recordRound(r: RoundRecord): number | null {
    const exists = this.db.prepare('SELECT 1 FROM rounds WHERE epoch = ? AND table_round = ?').get(r.epoch, r.tableRound);
    if (exists) return null;
    const res = this.db.prepare('INSERT INTO rounds (epoch, table_round, settled_at, dealer_json) VALUES (?, ?, ?, ?)')
      .run(r.epoch, r.tableRound, r.settledAt, JSON.stringify(r.dealerCards));
    const roundId = Number(res.lastInsertRowid);
    const hand = this.db.prepare('INSERT INTO round_hands (round_id, player_id, seat, hand_index, cards_json, bet, doubled, from_split, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const h of r.hands) hand.run(roundId, h.playerId, h.seat, h.handIndex, JSON.stringify(h.cards), h.bet, h.doubled ? 1 : 0, h.fromSplit ? 1 : 0, h.status);
    const result = this.db.prepare('INSERT INTO round_results (round_id, player_id, seat, hand_index, kind, stake, payout, net, outcome, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const x of r.results) result.run(roundId, x.playerId, x.seat, x.handIndex ?? -1, x.kind, x.stake, x.payout, x.net, x.outcome, x.label);
    return roundId;
  }

  getStats(playerId: string): PlayerStats {
    const one = (sql: string) => this.db.prepare(sql).get(playerId) as Row;
    const rounds = Number(one('SELECT COUNT(DISTINCT round_id) AS n FROM round_hands WHERE player_id = ?').n);
    const naturals = Number(one("SELECT COUNT(*) AS n FROM round_hands WHERE player_id = ? AND status = 'blackjack'").n);
    const main = one(`SELECT COUNT(*) AS hands,
        COALESCE(SUM(CASE WHEN payout > stake THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN payout = stake THEN 1 ELSE 0 END), 0) AS pushes,
        COALESCE(SUM(CASE WHEN payout < stake THEN 1 ELSE 0 END), 0) AS losses
      FROM round_results WHERE player_id = ? AND kind = 'main'`);
    const creditsAdded = Number(one('SELECT COALESCE(SUM(amount), 0) AS n FROM ledger_entries WHERE player_id = ?').n);
    const byKind = Object.fromEntries(KINDS.map((k) => [k, { count: 0, wins: 0, stake: 0, returned: 0, net: 0 }])) as PlayerStats['byKind'];
    const rows = this.db.prepare(`SELECT kind, COUNT(*) AS count, SUM(CASE WHEN payout > stake THEN 1 ELSE 0 END) AS wins,
        SUM(stake) AS stake, SUM(payout) AS returned, SUM(net) AS net FROM round_results WHERE player_id = ? GROUP BY kind`).all(playerId) as Row[];
    for (const r of rows) byKind[r.kind as ResultKind] = { count: Number(r.count), wins: Number(r.wins), stake: Number(r.stake), returned: Number(r.returned), net: Number(r.net) };
    const sum = (f: 'stake' | 'returned' | 'net') => KINDS.reduce((a, k) => a + byKind[k][f], 0);
    const hands = Number(main.hands);
    return {
      rounds, hands, wins: Number(main.wins), losses: Number(main.losses), pushes: Number(main.pushes), naturals,
      winRate: hands > 0 ? Number(main.wins) / hands : null,
      stake: sum('stake'), returned: sum('returned'), net: sum('net'), byKind, creditsAdded,
    };
  }

  getHistory(playerId: string, limit: number): RoundHistoryEntry[] {
    const rounds = this.db.prepare(`SELECT id, settled_at, dealer_json FROM rounds
      WHERE id IN (SELECT DISTINCT round_id FROM round_hands WHERE player_id = ?) ORDER BY id DESC LIMIT ?`).all(playerId, limit) as Row[];
    const hands = this.db.prepare('SELECT seat, hand_index, cards_json, bet, doubled, from_split, status FROM round_hands WHERE round_id = ? AND player_id = ? ORDER BY seat, hand_index');
    const results = this.db.prepare('SELECT seat, hand_index, kind, stake, payout, net, outcome, label FROM round_results WHERE round_id = ? AND player_id = ? ORDER BY seat, hand_index, kind');
    return rounds.map((r) => {
      const seats = new Map<number, RoundHistoryEntry['seats'][number]>();
      const seat = (n: number) => seats.get(n) ?? (seats.set(n, { seat: n, number: n + 1, net: 0, hands: [], results: [] }), seats.get(n)!);
      for (const h of hands.all(r.id, playerId) as Row[])
        seat(h.seat).hands.push({ index: h.hand_index, cards: JSON.parse(h.cards_json) as Card[], bet: h.bet, doubled: !!h.doubled, fromSplit: !!h.from_split, status: h.status });
      for (const x of results.all(r.id, playerId) as Row[]) {
        const s = seat(x.seat);
        s.results.push({ kind: x.kind, handIndex: x.hand_index < 0 ? null : x.hand_index, stake: x.stake, payout: x.payout, net: x.net, outcome: x.outcome, label: x.label });
        s.net += x.net;
      }
      const list = [...seats.values()].sort((a, b) => a.seat - b.seat);
      return { roundId: r.id, settledAt: r.settled_at, dealer: JSON.parse(r.dealer_json) as Card[], net: list.reduce((a, s) => a + s.net, 0), seats: list };
    });
  }

  close() { this.db.close(); }
}
