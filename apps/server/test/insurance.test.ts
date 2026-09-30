import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/sqlite';
import { GameService } from '../src/gameService';
import { SqliteRepository } from '../src/sqliteRepository';
import { Shoe } from '@bj/engine';
import { c } from './helpers';

/** Reproduz pelo endpoint da interface (POST /api/commands) o bug do Insurance recusado com blackjack do dealer. */
let server: Server;
let base: string;
let seq: string[];
let n = 0;

async function start(cards: string[]) {
  seq = cards;
  const service = new GameService(new SqliteRepository(openDatabase(':memory:')), { tableOptions: { shoeFactory: () => Shoe.stacked(seq.map(c)), reshuffleBelow: 0 } });
  server = createApp({ service, config: { allowedOrigins: [], devTools: false } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(() => { server?.close(); });

async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
}
const cmd = (token: string, command: Record<string, unknown>) => call('POST', '/api/commands', token, { command: { id: `i${++n}`, ...command } });
async function player(name: string, seats: number[], main = 1000) {
  const g = (await call('POST', '/api/guest', undefined, { name })).body;
  const t = g.token as string;
  expect((await cmd(t, { type: 'buyIn', amount: 100_000 })).body.result.ok).toBe(true);
  for (const s of seats) {
    await cmd(t, { type: 'takeSeat', seat: s });
    await cmd(t, { type: 'setBet', seat: s, kind: 'main', amount: main });
    await cmd(t, { type: 'confirmBets', seat: s });
  }
  return t;
}
const table = async (t: string) => (await call('GET', '/api/table', t)).body;

describe('POST /api/commands: Insurance e blackjack do dealer', () => {
  it('dealer A+Q, jogador 9+7, Insurance recusado: rodada termina e Hit é rejeitado', async () => {
    await start(['9S', 'AD', '7H', 'QC', '5D']);
    const t = await player('Ana', [3]);
    expect((await cmd(t, { type: 'deal' })).body.result.ok).toBe(true);
    expect((await table(t)).phase).toBe('INSURANCE');
    expect((await cmd(t, { type: 'insurance', seat: 3, take: false })).body.result.ok).toBe(true);
    const v = await table(t);
    expect(v.phase).toBe('SETTLEMENT');
    expect(v.dealer.cards).toHaveLength(2);
    const hit = await cmd(t, { type: 'action', seat: 3, action: 'hit' });
    expect(hit.status).toBe(422);
    expect(hit.body.result).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    const after = await table(t);
    expect(after.seats[3].hands[0].cards).toHaveLength(2);
    expect(after.phase).toBe('SETTLEMENT');
  });

  it('dois lugares: só a última decisão encerra a rodada', async () => {
    await start(['9S', '10H', 'AD', '7H', '8C', 'QC', '5D']);
    const t = await player('Ana', [0, 1]);
    await cmd(t, { type: 'deal' });
    expect((await cmd(t, { type: 'insurance', seat: 0, take: false })).body.result.ok).toBe(true);
    expect((await table(t)).phase).toBe('INSURANCE');
    expect((await cmd(t, { type: 'action', seat: 0, action: 'hit' })).body.result.ok).toBe(false);
    expect((await cmd(t, { type: 'action', seat: 1, action: 'hit' })).body.result.ok).toBe(false);
    expect((await cmd(t, { type: 'insurance', seat: 1, take: false })).body.result.ok).toBe(true);
    const v = await table(t);
    expect(v.phase).toBe('SETTLEMENT');
    expect(v.seats[0].hands[0].cards).toHaveLength(2);
    expect(v.seats[1].hands[0].cards).toHaveLength(2);
  });

  it('sem blackjack: turnos liberados e carta fechada continua oculta na visão', async () => {
    await start(['9S', 'AD', '7H', '6C', '2D']);
    const t = await player('Ana', [0]);
    await cmd(t, { type: 'deal' });
    await cmd(t, { type: 'insurance', seat: 0, take: false });
    const v = await table(t);
    expect(v.phase).toBe('PLAYER_TURNS');
    expect(JSON.stringify(v.dealer)).not.toContain('"6"'); // carta fechada não vaza
    expect((await cmd(t, { type: 'action', seat: 0, action: 'stand' })).body.result.ok).toBe(true);
  });
});
