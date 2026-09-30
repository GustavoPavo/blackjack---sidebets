import type { DatabaseSync } from 'node:sqlite';

export interface Migration { version: number; name: string; sql: string }

/**
 * Migrações em ordem. NUNCA edite uma migração já publicada: acrescente uma nova versão.
 * Valores monetários são sempre INTEGER em centavos.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
      CREATE TABLE players (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        balance     INTEGER NOT NULL CHECK (balance >= 0),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE TABLE sessions (
        token_hash    TEXT PRIMARY KEY,           -- sha256 do token; o token em si nunca é gravado
        player_id     TEXT NOT NULL REFERENCES players(id),
        created_at    TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL,
        revoked_at    TEXT
      );
      CREATE INDEX idx_sessions_player ON sessions(player_id);
      CREATE TABLE ledger_entries (
        player_id      TEXT NOT NULL REFERENCES players(id),
        command_id     TEXT NOT NULL,
        type           TEXT NOT NULL CHECK (type IN ('buyIn', 'rebuy')),
        amount         INTEGER NOT NULL CHECK (amount > 0),
        balance_after  INTEGER NOT NULL,
        at             TEXT NOT NULL,
        PRIMARY KEY (player_id, command_id)
      );
      CREATE TABLE preferences (
        player_id   TEXT PRIMARY KEY REFERENCES players(id),
        json        TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE TABLE processed_commands (
        player_id    TEXT NOT NULL,
        command_id   TEXT NOT NULL,
        type         TEXT NOT NULL,
        at           TEXT NOT NULL,
        PRIMARY KEY (player_id, command_id)
      );
      CREATE INDEX idx_processed_at ON processed_commands(at);
      CREATE TABLE table_state (
        id                    INTEGER PRIMARY KEY CHECK (id = 1),
        epoch                 INTEGER NOT NULL,
        last_recorded_round   INTEGER NOT NULL,
        json                  TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );
      CREATE TABLE rounds (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        epoch        INTEGER NOT NULL,
        table_round  INTEGER NOT NULL,
        settled_at   TEXT NOT NULL,
        dealer_json  TEXT NOT NULL,
        UNIQUE (epoch, table_round)              -- uma rodada é registrada uma única vez
      );
      CREATE TABLE round_hands (
        round_id    INTEGER NOT NULL REFERENCES rounds(id),
        player_id   TEXT NOT NULL REFERENCES players(id),
        seat        INTEGER NOT NULL,
        hand_index  INTEGER NOT NULL,
        cards_json  TEXT NOT NULL,
        bet         INTEGER NOT NULL,
        doubled     INTEGER NOT NULL,
        from_split  INTEGER NOT NULL,
        status      TEXT NOT NULL,
        PRIMARY KEY (round_id, seat, hand_index)
      );
      CREATE INDEX idx_round_hands_player ON round_hands(player_id, round_id);
      CREATE TABLE round_results (
        round_id    INTEGER NOT NULL REFERENCES rounds(id),
        player_id   TEXT NOT NULL REFERENCES players(id),
        seat        INTEGER NOT NULL,
        hand_index  INTEGER NOT NULL,            -- -1 para apostas que não são de uma mão (side bets, insurance)
        kind        TEXT NOT NULL CHECK (kind IN ('main', 'twentyThree', 'pairs', 'buster', 'insurance')),
        stake       INTEGER NOT NULL,
        payout      INTEGER NOT NULL,            -- retorno total (aposta + lucro); 0 se perdeu
        net         INTEGER NOT NULL,            -- lucro líquido = payout - stake
        outcome     TEXT NOT NULL,
        label       TEXT NOT NULL,
        PRIMARY KEY (round_id, seat, kind, hand_index)
      );
      CREATE INDEX idx_round_results_player ON round_results(player_id, kind);
    `,
  },
];

export function migrate(db: DatabaseSync, migrations: Migration[] = MIGRATIONS, now: () => string = () => new Date().toISOString()) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const known = new Set(migrations.map((m) => m.version));
  for (const v of applied) {
    if (!known.has(v)) throw new Error(`O banco está na migração ${v}, desconhecida por esta versão do servidor. Atualize o servidor.`);
  }
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Falha na migração ${m.version} (${m.name}): ${(e as Error).message}`);
    }
  }
}
