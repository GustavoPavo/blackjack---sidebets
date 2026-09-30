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
  it('fluxo completo: nome, carteira única, lugares, rodada; cliente não escolhe cartas nem vê a fechada', async () => {
    const P = 'jogador-1';
    expect((await post({ id: 'a0', type: 'setName', playerId: P, name: 'Ana' })).body.table.me.name).toBe('Ana');
    expect((await post({ id: 'a1', type: 'buyIn', playerId: P, amount: 100_000 })).status).toBe(200);
    expect((await post({ id: 'a1b', type: 'buyIn', playerId: P, amount: 1 })).body.result.code).toBe('ALREADY_BOUGHT_IN');
    expect((await post({ id: 'a3', type: 'rebuy', playerId: P, amount: 100_001 })).status).toBe(422);
    await post({ id: 'a3b', type: 'takeSeat', playerId: P, seat: 0 });
    const two = await post({ id: 'a3c', type: 'takeSeat', playerId: P, seat: 4 });
    expect(two.body.table.me.seats).toEqual([0, 4]); // um jogador, dois lugares, uma carteira
    await post({ id: 'a4', type: 'setBet', playerId: P, seat: 0, kind: 'main', amount: 500 });
    await post({ id: 'a5', type: 'confirmBets', playerId: P, seat: 0 });
    const dealt = await post({ id: 'a6', type: 'deal', playerId: P, cards: ['AS', 'AS'] });
    expect(dealt.body.table.phase).toBe('PLAYER_TURNS');
    expect(dealt.body.table.dealer.cards[1]).toBeNull();
    expect(dealt.body.table.seats[0].hands[0].cards[0]).toEqual(card('10', 'S')); // veio do shoe, não do cliente
    const stand = await post({ id: 'a7', type: 'action', playerId: P, seat: 0, action: 'stand' });
    expect(stand.body.table.phase).toBe('SETTLEMENT');
    expect(stand.body.table.me.balance).toBe(99_500 + 500 * 2); // 20 vs 18
    expect(stand.body.table.roundSummary[0].message.text).toBe('Você ganhou R$ 5,00');
    const again = await post({ id: 'a7', type: 'action', playerId: P, seat: 0, action: 'stand' });
    expect(again.body.result).toMatchObject({ ok: true, duplicate: true });
    expect(again.body.table.me.balance).toBe(100_500);
  });
  it('outro jogador não controla o lugar alheio', async () => {
    await post({ id: 'b0', type: 'setName', playerId: 'outro', name: 'Beto' });
    const r = await post({ id: 'b1', type: 'setBet', playerId: 'outro', seat: 0, kind: 'main', amount: 500 });
    expect(r.body.result.code).toBe('WRONG_PHASE'); // rodada ainda em SETTLEMENT
    await post({ id: 'b2', type: 'nextRound', playerId: 'outro' });
    const r2 = await post({ id: 'b3', type: 'setBet', playerId: 'outro', seat: 0, kind: 'main', amount: 500 });
    expect(r2.body.result.code).toBe('NOT_SEAT_OWNER');
  });
  it('rejeita corpo inválido e comando sem id', async () => {
    const r = await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    expect(r.status).toBe(400);
    expect((await post({ type: 'deal', playerId: 'x' })).body.result.code).toBe('MISSING_COMMAND_ID');
    expect((await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400);
  });
  it('GET /api/table?playerId= personaliza a visão e expõe modo de simulação local', async () => {
    const t = await (await fetch(`${base}/api/table?playerId=jogador-1`)).json();
    expect(t.mode).toBe('local-simulation');
    expect(t.me.name).toBe('Ana');
    expect(t.seats[0].mine).toBe(true);
    const anon = await (await fetch(`${base}/api/table`)).json();
    expect(anon.me).toBeNull();
    expect(JSON.stringify(t)).not.toMatch(/shoe"\s*:\s*\[/);
  });
});
