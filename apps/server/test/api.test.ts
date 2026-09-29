import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Shoe, Table } from '@bj/engine';
import { createApp } from '../src/app';

let server: Server;
let base: string;
const card = (rank: any, suit: any) => ({ rank, suit });

beforeAll(async () => {
  const seq = [card('10', 'S'), card('10', 'D'), card('9', 'H'), card('8', 'C')];
  server = createApp(() => new Table({ shoeFactory: () => Shoe.stacked(seq), reshuffleBelow: 0 })).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

const post = (command: unknown) =>
  fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) })
    .then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

describe('API', () => {
  it('fluxo completo pelo servidor; cliente não vê a carta fechada nem escolhe cartas', async () => {
    expect((await post({ id: 'a1', type: 'buyIn', seat: 0, amount: 100_000 })).status).toBe(200);
    expect((await post({ id: 'a2', type: 'buyIn', seat: 0, amount: 1 })).body.result.code).toBe('SEAT_OCCUPIED');
    expect((await post({ id: 'a3', type: 'buyIn', seat: 1, amount: 100_001 })).status).toBe(422);
    await post({ id: 'a4', type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    await post({ id: 'a5', type: 'confirmBets', seat: 0 });
    const dealt = await post({ id: 'a6', type: 'deal', cards: ['AS', 'AS'] });
    expect(dealt.body.table.phase).toBe('PLAYER_TURNS');
    expect(dealt.body.table.dealer.cards[1]).toBeNull();
    expect(dealt.body.table.seats[0].hands[0].cards[0]).toEqual(card('10', 'S')); // veio do shoe, não do cliente
    const stand = await post({ id: 'a7', type: 'action', seat: 0, action: 'stand' });
    expect(stand.body.table.phase).toBe('SETTLEMENT');
    expect(stand.body.table.seats[0].balance).toBe(99_500 + 500 * 2); // 20 vs 18
    const again = await post({ id: 'a7', type: 'action', seat: 0, action: 'stand' });
    expect(again.body.result).toMatchObject({ ok: true, duplicate: true });
    expect(again.body.table.seats[0].balance).toBe(100_500);
  });
  it('rejeita corpo inválido e comando sem id', async () => {
    const r = await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    expect(r.status).toBe(400);
    expect((await post({ type: 'deal' })).body.result.code).toBe('MISSING_COMMAND_ID');
    expect((await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400);
  });
  it('GET /api/table expõe modo de simulação local', async () => {
    const t = await (await fetch(`${base}/api/table`)).json();
    expect(t.mode).toBe('local-simulation');
    expect(JSON.stringify(t)).not.toMatch(/shoe"\s*:\s*\[/);
  });
});
