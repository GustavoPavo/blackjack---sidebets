import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PREFERENCES, Table, parsePreferences, toView,
  type Command, type CommandResult, type Preferences, type PlayerStats, type RoundHistoryEntry, type TableOptions, type TableView,
} from '@bj/engine';
import { hashToken, looksLikeToken, newToken } from './auth';
import type { GameRepository, RoundRecord } from './repository';

export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const PROCESSED_TTL_MS = 30 * 24 * 3600 * 1000;
const SEEN_THROTTLE_MS = 60_000;
const MAX_COMMAND_ID = 100;

export interface ServiceOptions {
  tableOptions?: TableOptions;
  now?: () => Date;
}

/**
 * Serviço da mesa real: junta o motor (Table) e o repositório.
 *
 * Integridade:
 *  - Cada comando aceito é gravado numa ÚNICA transação: carteira(s), lançamento de crédito, id do comando
 *    (idempotência), snapshot da mesa e, se a rodada terminou, o histórico. Ou tudo persiste ou nada.
 *  - Se a gravação falhar, a memória é recarregada do último estado gravado (nunca divergem).
 *  - Ids de comando são escopados por jogador e sobrevivem a reinícios: repetir um comando não debita nem credita de novo.
 *
 * Recuperação após reinício: RETOMAR o estado salvo (ver docs/PERSISTENCE.md).
 */
export class GameService {
  table!: Table;
  private saved = new Map<string, string>();
  private epoch = 1;
  private lastRecordedRound = 0;
  private now: () => Date;

  constructor(private repo: GameRepository, private opts: ServiceOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.load();
    this.repo.pruneProcessed(new Date(this.now().getTime() - PROCESSED_TTL_MS).toISOString());
  }

  private iso() { return this.now().toISOString(); }

  /** Carrega jogadores e o snapshot da mesa do banco. Falha (não inicia) se o estado salvo for inconsistente. */
  private load() {
    const table = new Table({ now: this.now, ...this.opts.tableOptions });
    for (const p of this.repo.loadPlayers()) table.players.set(p.id, { id: p.id, name: p.name, balance: p.balance, ledger: p.ledger });
    const st = this.repo.loadTableState();
    if (st) {
      table.restore(JSON.parse(st.json));
      this.epoch = st.epoch;
      this.lastRecordedRound = st.lastRecordedRound;
    }
    this.table = table;
    this.saved.clear();
    for (const p of table.players.values()) this.saved.set(p.id, this.fingerprint(p));
  }

  private fingerprint(p: { name: string; balance: number; ledger: unknown[] }) { return `${p.name}|${p.balance}|${p.ledger.length}`; }

  // ------------------------------------------------------------ sessões (convidado)
  /** Cria um jogador convidado e uma sessão persistente. O token só é devolvido aqui, uma vez. */
  createGuest(name: unknown): { playerId: string; token: string } {
    const playerId = randomUUID();
    const token = newToken();
    const r = this.table.dispatch({ id: `${playerId}:guest`, type: 'setName', playerId, name: name as string });
    if (!r.ok) throw new ServiceError(400, r.code, r.message);
    this.commit(() => this.repo.createSession(hashToken(token), playerId, this.iso()));
    return { playerId, token };
  }

  authenticate(token: unknown): string | null {
    if (!looksLikeToken(token)) return null;
    const h = hashToken(token);
    const s = this.repo.findSession(h);
    if (!s) return null;
    const t = this.now().getTime();
    if (t - Date.parse(s.lastSeenAt) > SEEN_THROTTLE_MS) this.repo.touchSession(h, this.iso());
    return s.playerId;
  }

  logout(token: string) { this.repo.revokeSession(hashToken(token), this.iso()); }

  // ------------------------------------------------------------ comandos
  /**
   * Executa um comando do jogador autenticado. O `playerId` vem da sessão; qualquer `playerId` enviado
   * pelo cliente é ignorado.
   */
  execute(playerId: string, raw: unknown): { result: CommandResult; view: TableView } {
    if (!raw || typeof raw !== 'object') throw new ServiceError(400, 'INVALID_COMMAND', 'Corpo inválido.');
    const cmd = raw as { id?: unknown; type?: unknown };
    if (typeof cmd.id !== 'string' || cmd.id.length === 0 || cmd.id.length > MAX_COMMAND_ID)
      return { result: { ok: false, code: 'MISSING_COMMAND_ID', message: 'Comando sem id válido.' }, view: this.view(playerId) };
    if (this.repo.hasProcessed(playerId, cmd.id))
      return { result: { ok: true, duplicate: true }, view: this.view(playerId) };

    const engineCmd = { ...(raw as object), id: `${playerId}:${cmd.id}`, playerId } as Command;
    const result = this.table.dispatch(engineCmd);
    if (!result.ok) return { result, view: this.view(playerId) };
    this.commit(() => this.repo.putProcessed(playerId, cmd.id as string, String(cmd.type), this.iso()));
    return { result, view: this.view(playerId) };
  }

  /**
   * Grava, numa única transação, tudo o que mudou na memória. Em falha, recarrega do banco para que
   * memória e disco nunca divirjam (o comando é tratado como não executado).
   */
  private commit(extra?: () => void) {
    const t = this.table;
    const now = this.iso();
    const nextRecorded = t.phase === 'SETTLEMENT' && this.lastRecordedRound !== t.round ? t.round : this.lastRecordedRound;
    const changed: { id: string; fp: string }[] = [];
    try {
      this.repo.transaction(() => {
        for (const p of t.players.values()) {
          const fp = this.fingerprint(p);
          if (this.saved.get(p.id) === fp) continue;
          this.repo.savePlayer(p, now);
          for (const e of p.ledger) this.repo.addLedgerEntry(p.id, e);
          changed.push({ id: p.id, fp });
        }
        extra?.(); // depois dos jogadores (sessões referenciam players)
        if (nextRecorded !== this.lastRecordedRound) this.repo.recordRound(this.buildRound(now));
        this.repo.saveTableState({ epoch: this.epoch, lastRecordedRound: nextRecorded, json: JSON.stringify(t.snapshot()) }, now);
      });
    } catch (e) {
      this.load(); // descarta a mudança em memória
      throw e;
    }
    this.lastRecordedRound = nextRecorded;
    for (const c of changed) this.saved.set(c.id, c.fp);
  }

  private buildRound(settledAt: string): RoundRecord {
    const t = this.table;
    const rec: RoundRecord = { epoch: this.epoch, tableRound: t.round, settledAt, dealerCards: t.dealer.cards, hands: [], results: [] };
    for (const s of t.seats) {
      if (!s.playerId || s.hands.length === 0) continue;
      s.hands.forEach((h, i) => rec.hands.push({ playerId: s.playerId!, seat: s.index, handIndex: i, cards: h.cards, bet: h.bet, doubled: h.doubled, fromSplit: h.fromSplit, status: h.status }));
      for (const r of s.results)
        rec.results.push({ playerId: s.playerId, seat: s.index, handIndex: r.handIndex ?? null, kind: r.kind, stake: r.stake, payout: r.payout, net: r.net, outcome: r.outcome, label: r.label });
    }
    return rec;
  }

  // ------------------------------------------------------------ consultas
  view(playerId?: string): TableView { return toView(this.table, playerId); }
  playerName(playerId: string): string | null { return this.table.players.get(playerId)?.name ?? null; }

  getPreferences(playerId: string): Preferences {
    const stored = parsePreferences(this.repo.getPreferences(playerId)) ?? {};
    return { ...DEFAULT_PREFERENCES, ...stored };
  }
  setPreferences(playerId: string, patch: unknown): Preferences {
    const parsed = parsePreferences(patch);
    if (!parsed) throw new ServiceError(400, 'INVALID_PREFERENCES', 'Preferências inválidas.');
    const next = { ...this.getPreferences(playerId), ...parsed };
    this.repo.transaction(() => this.repo.savePreferences(playerId, JSON.stringify(next), this.iso()));
    return next;
  }

  stats(playerId: string): PlayerStats { return this.repo.getStats(playerId); }
  history(playerId: string, limit: number): RoundHistoryEntry[] { return this.repo.getHistory(playerId, Math.max(1, Math.min(50, limit))); }

  /** Ferramenta de desenvolvimento: cancela a rodada devolvendo as apostas não liquidadas. */
  cancelRound(): number {
    const refunded = this.table.abortRound();
    this.commit();
    return refunded;
  }
}
