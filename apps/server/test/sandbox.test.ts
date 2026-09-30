import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/sqlite';
import { GameService } from '../src/gameService';
import { SandboxService, TUTORIAL_SHOE } from '../src/sandbox';
import { SqliteRepository } from '../src/sqliteRepository';
import { Shoe } from '@bj/engine';
import { c } from './helpers';

let server: Server;
let base: string;
let service: GameService;
let db: ReturnType<typeof openDatabase>;
let clock = 1_000_000;
const sandbox = new SandboxService({ now: () => clock, ttlMs: 3600_000 });

beforeAll(async () => {
  db = openDatabase(':memory:');
  service = new GameService(new SqliteRepository(db), { tableOptions: { shoeFactory: () => Shoe.stacked(['10S', '10D', '9H', '8C'].map(c)), reshuffleBelow: 0 } });
  server = createApp({ service, sandbox, config: { allowedOrigins: [], devTools: false } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
let n = 0;
const cmd = (token: string, mode: string | null, command: Record<string, unknown>) =>
  call('POST', `/api/commands${mode ? `?mode=${mode}` : ''}`, token, { command: { id: `s${++n}`, ...command } });
const guest = async (name: string) => (await call('POST', '/api/guest', undefined, { name })).body as { token: string; playerId: string };

describe('modo treino e tutorial: sessões separadas da carteira real', () => {
  it('exigem sessão; modo desconhecido é recusado', async () => {
    expect((await call('GET', '/api/table?mode=training')).status).toBe(401);
    expect((await call('POST', '/api/sandbox/training/start')).status).toBe(401);
    const g = await guest('Ana');
    expect((await call('GET', '/api/table?mode=xyz', g.token)).status).toBe(400);
    expect((await call('POST', '/api/sandbox/xyz/start', g.token)).status).toBe(404);
  });

  it('treino tem carteira própria; jogar nele não altera saldo real, histórico, estatísticas nem o banco', async () => {
    const g = await guest('Ana');
    await cmd(g.token, null, { type: 'buyIn', amount: 50_000 });
    const before = {
      rounds: db.prepare('SELECT COUNT(*) AS n FROM rounds').get(),
      ledger: db.prepare('SELECT COUNT(*) AS n FROM ledger_entries WHERE player_id = ?').get(g.playerId),
      player: db.prepare('SELECT balance FROM players WHERE id = ?').get(g.playerId),
      state: db.prepare('SELECT json FROM table_state').get(),
    };
    const start = await call('POST', '/api/sandbox/training/start', g.token);
    expect(start.body.kind).toBe('training');
    expect(start.body.me).toMatchObject({ name: 'Ana', balance: 100_000 }); // créditos de treino
    await cmd(g.token, 'training', { type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    await cmd(g.token, 'training', { type: 'confirmBets', seat: 0 });
    let v = (await cmd(g.token, 'training', { type: 'deal' })).body.table;
    while (v.phase !== 'SETTLEMENT') {
      if (v.phase === 'INSURANCE') { v = (await cmd(g.token, 'training', { type: 'insurance', seat: 0, take: false })).body.table; continue; }
      v = (await cmd(g.token, 'training', { type: 'action', seat: 0, action: 'stand' })).body.table;
    }
    expect(v.roundSummary).toHaveLength(1);
    // a carteira real e o banco seguem idênticos
    expect((await call('GET', '/api/table', g.token)).body.me.balance).toBe(50_000);
    expect((await call('GET', '/api/stats', g.token)).body).toMatchObject({ rounds: 0, hands: 0, net: 0, creditsAdded: 50_000 });
    expect((await call('GET', '/api/history', g.token)).body).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM rounds').get()).toEqual(before.rounds);
    expect(db.prepare('SELECT COUNT(*) AS n FROM ledger_entries WHERE player_id = ?').get(g.playerId)).toEqual(before.ledger);
    expect(db.prepare('SELECT balance FROM players WHERE id = ?').get(g.playerId)).toEqual(before.player);
    expect(db.prepare('SELECT json FROM table_state').get()).toEqual(before.state);
  });

  it('a mesa real não mostra dicas; a de treino mostra a sugestão da mão ativa', async () => {
    const g = await guest('Bia');
    await cmd(g.token, null, { type: 'buyIn', amount: 100_000 });
    await cmd(g.token, null, { type: 'takeSeat', seat: 3 });
    expect((await call('GET', '/api/table', g.token)).body.hint).toBeNull();
    await call('POST', '/api/sandbox/training/start', g.token);
    await cmd(g.token, 'training', { type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    await cmd(g.token, 'training', { type: 'confirmBets', seat: 0 });
    let t = (await cmd(g.token, 'training', { type: 'deal' })).body.table;
    if (t.phase === 'INSURANCE') {
      expect(t.insuranceHint).toMatchObject({ action: 'decline' });
      t = (await cmd(g.token, 'training', { type: 'insurance', seat: 0, take: false })).body.table;
    }
    if (t.phase === 'PLAYER_TURNS') {
      expect(t.hint).not.toBeNull();
      expect(t.hint.explanation.length).toBeGreaterThan(10);
      expect(t.hint.disclaimer).toMatch(/Não garante lucro/);
      if (t.hint.action) expect(t.legalActions).toContain(t.hint.action);
    }
  });

  it('o tutorial usa um baralho fixo e começa sempre igual; "start" reinicia a demonstração', async () => {
    const g = await guest('Cris');
    for (let i = 0; i < 2; i++) {
      const s = await call('POST', '/api/sandbox/demo/start', g.token);
      expect(s.body).toMatchObject({ kind: 'demo', phase: 'BETTING' });
      expect(s.body.me.balance).toBe(10_000);
      await cmd(g.token, 'demo', { type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
      await cmd(g.token, 'demo', { type: 'setBet', seat: 0, kind: 'pairs', amount: 250 });
      await cmd(g.token, 'demo', { type: 'confirmBets', seat: 0 });
      const d = (await cmd(g.token, 'demo', { type: 'deal' })).body.table;
      expect(d.seats[0].hands[0].cards.map((x: any) => x.rank + x.suit)).toEqual(['5H', '6D']);
      expect(d.dealer.cards[0]).toEqual({ rank: '6', suit: 'S' });
      expect(d.dealer.cards[1]).toBeNull();
      expect(d.hint.action).toBe('double'); // 11 contra 6
    }
    expect(TUTORIAL_SHOE.slice(0, 6)).toEqual(['5H', '6S', '6D', '10C', '9C', '8D']);
  });

  it('o jogador não controla a sandbox de outro; a identidade vem do token', async () => {
    const a = await guest('Ana'), b = await guest('Beto');
    await call('POST', '/api/sandbox/training/start', a.token);
    // Beto tem a sua própria; o playerId enviado no corpo é ignorado
    const r = await cmd(b.token, 'training', { type: 'setBet', seat: 0, kind: 'main', amount: 500, playerId: a.playerId });
    expect(r.body.table.me.name).toBe('Beto');
    expect(r.body.result.ok).toBe(true);
    const va = (await call('GET', '/api/table?mode=training', a.token)).body;
    expect(va.seats[0].bets.main).toBe(0); // a sandbox da Ana não foi tocada
  });

  it('sessões inativas expiram', async () => {
    const before = sandbox.size;
    const g = await guest('Dani');
    await call('GET', '/api/table?mode=training', g.token);
    expect(sandbox.size).toBe(before + 1);
    clock += 3 * 3600_000;
    await call('GET', '/api/table?mode=training', g.token); // dispara a limpeza e recria apenas a do Dani
    expect(sandbox.size).toBe(1);
  });
});
