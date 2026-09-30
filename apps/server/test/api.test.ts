import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/sqlite';
import { GameService } from '../src/gameService';
import { SqliteRepository } from '../src/sqliteRepository';
import { Shoe } from '@bj/engine';
import { c } from './helpers';

let server: Server;
let base: string;
let service: GameService;

beforeAll(async () => {
  const seq = ['10S', '10D', '9H', '8C'].map(c);
  service = new GameService(new SqliteRepository(openDatabase(':memory:')), { tableOptions: { shoeFactory: () => Shoe.stacked(seq), reshuffleBelow: 0 } });
  server = createApp({ service, config: { allowedOrigins: ['https://app.exemplo.test', 'capacitor://localhost'], devTools: false } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

type Res = { status: number; body: any; headers: Headers };
async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, headers: r.headers };
}
let n = 0;
const cmd = (token: string, command: Record<string, unknown>) => call('POST', '/api/commands', { token, body: { command: { id: `k${++n}`, ...command } } });
const guest = async (name: string) => (await call('POST', '/api/guest', { body: { name } })).body as { token: string; playerId: string; table: any };

describe('sessão de convidado', () => {
  it('cria convidado, devolve o token uma vez e a visão com a carteira', async () => {
    const r = await call('POST', '/api/guest', { body: { name: 'Ana' } });
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^bj_/);
    expect(r.body.table.me).toMatchObject({ name: 'Ana', balance: 0 });
    expect((await call('GET', '/api/table', { token: r.body.token })).body.me.id).toBe(r.body.playerId);
  });
  it('nome vazio é recusado', async () => {
    expect((await call('POST', '/api/guest', { body: { name: '  ' } })).status).toBe(400);
    expect((await call('POST', '/api/guest', { body: {} })).status).toBe(400);
  });
  it('mesa pública sem sessão; token inválido e comandos sem sessão → 401', async () => {
    const pub = await call('GET', '/api/table');
    expect(pub.status).toBe(200);
    expect(pub.body.me).toBeNull();
    expect((await call('GET', '/api/table', { token: 'bj_' + 'z'.repeat(43) })).status).toBe(401);
    expect((await call('POST', '/api/commands', { body: { command: { id: 'x', type: 'deal' } } })).status).toBe(401);
    expect((await call('GET', '/api/stats')).status).toBe(401);
    expect((await call('GET', '/api/preferences')).status).toBe(401);
  });
  it('o id público de outro jogador não serve como credencial, nem dentro do comando', async () => {
    const a = await guest('Ana'), b = await guest('Beto');
    expect((await call('GET', '/api/table', { token: a.playerId })).status).toBe(401);
    await cmd(a.token, { type: 'buyIn', amount: 100_000 });
    await cmd(a.token, { type: 'takeSeat', seat: 2 });
    const hack = await cmd(b.token, { type: 'setBet', seat: 2, kind: 'main', amount: 500, playerId: a.playerId });
    expect(hack.status).toBe(422);
    expect(hack.body.result.code).toBe('NOT_SEAT_OWNER');
    const steal = await cmd(b.token, { type: 'leave', seat: 2, playerId: a.playerId });
    expect(steal.body.result.code).toBe('NOT_SEAT_OWNER');
    await cmd(a.token, { type: 'leave', seat: 2 });
  });
  it('logout revoga o token', async () => {
    const a = await guest('Ana');
    expect((await call('POST', '/api/session/logout', { token: a.token })).status).toBe(204);
    expect((await call('GET', '/api/table', { token: a.token })).status).toBe(401);
  });
});

describe('jogo pela API', () => {
  it('rodada completa; o cliente não escolhe cartas; repetir o id não repete o efeito', async () => {
    const a = await guest('Ana');
    await cmd(a.token, { type: 'buyIn', amount: 100_000 });
    expect((await cmd(a.token, { type: 'buyIn', amount: 1 })).body.result.code).toBe('ALREADY_BOUGHT_IN');
    await cmd(a.token, { type: 'takeSeat', seat: 0 });
    await cmd(a.token, { type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    await cmd(a.token, { type: 'confirmBets', seat: 0 });
    const dealt = await cmd(a.token, { type: 'deal', cards: ['AS', 'AS'] });
    expect(dealt.body.table.phase).toBe('PLAYER_TURNS');
    expect(dealt.body.table.dealer.cards[1]).toBeNull();
    expect(dealt.body.table.seats[0].hands[0].cards[0]).toEqual({ rank: '10', suit: 'S' });
    const body = { command: { id: 'stand-1', type: 'action', seat: 0, action: 'stand' } };
    const first = await call('POST', '/api/commands', { token: a.token, body });
    expect(first.body.table.me.balance).toBe(99_500 + 1000);
    expect(first.body.table.roundSummary[0].message.text).toBe('Você ganhou R$ 5,00');
    const again = await call('POST', '/api/commands', { token: a.token, body });
    expect(again.body.result).toMatchObject({ ok: true, duplicate: true });
    expect(again.body.table.me.balance).toBe(100_500);
    const st = (await call('GET', '/api/stats', { token: a.token })).body;
    expect(st).toMatchObject({ rounds: 1, hands: 1, wins: 1, net: 500, creditsAdded: 100_000 });
    const hist = (await call('GET', '/api/history?limit=5', { token: a.token })).body;
    expect(hist).toHaveLength(1);
    expect(hist[0].seats[0].results[0]).toMatchObject({ kind: 'main', net: 500 });
    await cmd(a.token, { type: 'nextRound' });
  });
  it('corpo inválido → 400; comando sem id → erro claro', async () => {
    const a = await guest('Ana');
    expect((await call('POST', '/api/commands', { token: a.token, body: '{ruim' })).status).toBe(400);
    expect((await call('POST', '/api/commands', { token: a.token, body: {} })).status).toBe(400);
    const r = await call('POST', '/api/commands', { token: a.token, body: { command: { type: 'deal' } } });
    expect(r.body.result.code).toBe('MISSING_COMMAND_ID');
  });
});

describe('preferências, CORS e limites', () => {
  it('preferências: padrão, atualização parcial, validação', async () => {
    const a = await guest('Ana');
    expect((await call('GET', '/api/preferences', { token: a.token })).body).toMatchObject({ sound: true, animationSpeed: 'normal' });
    const put = await call('PUT', '/api/preferences', { token: a.token, body: { sound: false, animationSpeed: 'fast' } });
    expect(put.body).toMatchObject({ sound: false, animationSpeed: 'fast', vibration: true });
    expect((await call('PUT', '/api/preferences', { token: a.token, body: { sound: 'sim' } })).status).toBe(400);
    expect((await call('PUT', '/api/preferences', { token: a.token, body: { hack: true } })).status).toBe(400);
    expect((await call('GET', '/api/preferences', { token: a.token })).body.sound).toBe(false);
  });
  it('CORS: só origens autorizadas, com pré-voo (preflight)', async () => {
    const ok = await call('OPTIONS', '/api/commands', { headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'POST' } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(ok.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    const bad = await call('GET', '/api/table', { headers: { origin: 'https://malicioso.test' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('ferramentas de desenvolvimento ficam desligadas por padrão', async () => {
    const a = await guest('Ana');
    expect((await call('POST', '/api/dev/cancel-round', { token: a.token })).status).toBe(404);
    expect((await call('GET', '/api/config')).body).toEqual({ devTools: false });
  });
  it('limita a criação de convidados por origem de rede', async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await call('POST', '/api/guest', { body: { name: `g${i}` } })).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});
