import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { openDatabase } from '../src/db/sqlite';
import { MIGRATIONS, migrate } from '../src/db/migrations';
import { SqliteRepository } from '../src/sqliteRepository';
import { boot, ok, run, tempDbPath } from './helpers';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const tmp = () => { const t = tempDbPath(); cleanups.push(t.cleanup); return t.file; };

describe('migrações', () => {
  it('aplica uma vez, registra a versão e é idempotente', () => {
    const file = tmp();
    const db = openDatabase(file);
    migrate(db); migrate(db);
    const rows = db.prepare('SELECT version, name FROM schema_migrations').all();
    expect(rows).toEqual([{ version: 1, name: 'initial' }]);
    db.close();
    const again = openDatabase(file); // reabrir não reaplica
    expect(again.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 1 });
    again.close();
  });
  it('uma migração que falha é desfeita por completo', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, [MIGRATIONS[0]!]);
    expect(() => migrate(db, [MIGRATIONS[0]!, { version: 2, name: 'ruim', sql: 'CREATE TABLE parcial (a INTEGER); COMANDO INVALIDO;' }])).toThrow(/migração 2/);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'parcial'").get()).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 1 });
  });
  it('recusa um banco mais novo que o servidor', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    db.prepare("INSERT INTO schema_migrations VALUES (99, 'futura', 'x')").run();
    expect(() => migrate(db)).toThrow(/desconhecida/);
  });
  it('carteira não pode ficar negativa (CHECK no banco)', () => {
    const db = openDatabase(':memory:');
    expect(() => db.prepare("INSERT INTO players VALUES ('a', 'A', -1, 'x', 'x')").run()).toThrow();
  });
});

describe('persistência de jogador e carteira', () => {
  it('saldo, histórico de créditos, lugar, apostas, nome e preferências sobrevivem ao reinício', () => {
    const file = tmp();
    let s = boot(file);
    const { playerId, token } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'rebuy', amount: 50_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    ok(s.service, playerId, { type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    s.service.setPreferences(playerId, { sound: false, animationSpeed: 'fast' });
    s.close();

    s = boot(file);
    const v = s.service.view(playerId);
    expect(v.me!.name).toBe('Ana');
    expect(v.me!.balance).toBe(149_500);
    expect(v.me!.ledger.map((l) => [l.type, l.amount])).toEqual([['buyIn', 100_000], ['rebuy', 50_000]]);
    expect(v.seats[0]!.playerId).toBe(playerId);
    expect(v.seats[0]!.bets.main).toBe(500);
    expect(s.service.authenticate(token)).toBe(playerId); // a sessão persiste
    expect(s.service.getPreferences(playerId)).toMatchObject({ sound: false, animationSpeed: 'fast', vibration: true });
    s.close();
  });

  it('editar o nome não cria outra carteira nem perde histórico, nem depois do reinício', () => {
    const file = tmp();
    let s = boot(file);
    const { playerId } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'setName', name: 'Ana Maria' });
    s.close();
    s = boot(file);
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM players').get()).toEqual({ n: 1 });
    const me = s.service.view(playerId).me!;
    expect(me).toMatchObject({ id: playerId, name: 'Ana Maria', balance: 100_000 });
    expect(me.ledger).toHaveLength(1);
    s.close();
  });

  it('o mesmo comando (mesmo id) repetido, inclusive após reinício, não debita nem credita de novo', () => {
    const file = tmp();
    let s = boot(file);
    const { playerId } = s.service.createGuest('Ana');
    s.service.execute(playerId, { id: 'buy-1', type: 'buyIn', amount: 100_000 });
    s.service.execute(playerId, { id: 'take-1', type: 'takeSeat', seat: 0 });
    s.service.execute(playerId, { id: 'bet-1', type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    expect(s.service.execute(playerId, { id: 'buy-1', type: 'buyIn', amount: 100_000 }).result).toMatchObject({ ok: true, duplicate: true });
    s.close();
    s = boot(file);
    for (const id of ['buy-1', 'bet-1', 'buy-1']) {
      expect(s.service.execute(playerId, { id, type: 'rebuy', amount: 99_999 }).result).toMatchObject({ ok: true, duplicate: true });
    }
    const v = s.service.view(playerId);
    expect(v.me!.balance).toBe(99_500);
    expect(v.me!.ledger).toHaveLength(1);
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get()).toEqual({ n: 1 });
    s.close();
  });

  it('ids de comando de jogadores diferentes não colidem', () => {
    const s = boot(tmp());
    const a = s.service.createGuest('A'), b = s.service.createGuest('B');
    s.service.execute(a.playerId, { id: 'mesmo', type: 'buyIn', amount: 1000 });
    const r = s.service.execute(b.playerId, { id: 'mesmo', type: 'buyIn', amount: 2000 });
    expect(r.result).toEqual({ ok: true });
    expect(r.view.me!.balance).toBe(2000);
    s.close();
  });
});

describe('sessão de convidado', () => {
  it('o token não é gravado em claro; o id público não autentica; playerId enviado é ignorado', () => {
    const s = boot(tmp());
    const a = s.service.createGuest('Ana'), b = s.service.createGuest('Beto');
    const hashes = (s.db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[]).map((r) => r.token_hash);
    expect(hashes).toHaveLength(2);
    expect(hashes).not.toContain(a.token);
    expect(JSON.stringify(s.db.prepare('SELECT * FROM sessions').all())).not.toContain(a.token);
    expect(s.service.authenticate(a.playerId)).toBeNull(); // identificador público não é credencial
    expect(s.service.authenticate('bj_' + 'x'.repeat(43))).toBeNull();
    expect(s.service.authenticate(undefined)).toBeNull();
    ok(s.service, a.playerId, { type: 'buyIn', amount: 1000 });
    ok(s.service, a.playerId, { type: 'takeSeat', seat: 0 });
    // Beto tenta agir no lugar da Ana informando o playerId dela: o servidor usa a identidade da sessão
    const r = run(s.service, b.playerId, { type: 'setBet', seat: 0, kind: 'main', amount: 500, playerId: a.playerId });
    expect(r.result).toMatchObject({ ok: false, code: 'NOT_SEAT_OWNER' });
    s.close();
  });

  it('logout revoga a sessão', () => {
    const s = boot(tmp());
    const a = s.service.createGuest('Ana');
    expect(s.service.authenticate(a.token)).toBe(a.playerId);
    s.service.logout(a.token);
    expect(s.service.authenticate(a.token)).toBeNull();
    s.close();
  });

  it('nome inválido não cria jogador nem sessão', () => {
    const s = boot(tmp());
    expect(() => s.service.createGuest('   ')).toThrow();
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM players').get()).toEqual({ n: 0 });
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    s.close();
  });
});

describe('recuperação após reinício durante a rodada: RETOMA o estado salvo', () => {
  // jogador 10+5=15; dealer 6 + 10 = 16; hit → 6 (21); dealer compra 10 → estoura (3 cartas)
  const SHOE = ['10S', '6D', '5H', '10C', '6S', '10H'];
  it('retoma a mão, liquida uma única vez e conserva os créditos', () => {
    const file = tmp();
    let s = boot(file, SHOE);
    const { playerId } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    ok(s.service, playerId, { type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    ok(s.service, playerId, { type: 'setBet', seat: 0, kind: 'buster', amount: 250 });
    ok(s.service, playerId, { type: 'confirmBets', seat: 0 });
    const dealt = ok(s.service, playerId, { type: 'deal' });
    expect(dealt.phase).toBe('PLAYER_TURNS');
    expect(dealt.me!.balance).toBe(98_750);
    s.close(); // ---- servidor reinicia no meio da mão

    s = boot(file); // sem shoe de teste: as cartas vêm do snapshot
    let v = s.service.view(playerId);
    expect(v.phase).toBe('PLAYER_TURNS');
    expect(v.turn).toEqual({ seat: 0, hand: 0 });
    expect(v.legalActions).toContain('hit');
    expect(v.dealer.cards[1]).toBeNull(); // a carta fechada continua escondida
    expect(v.me!.balance).toBe(98_750);
    expect(v.seats[0]!.hands[0]!.cards.map((x) => x.rank)).toEqual(['10', '5']);

    const hit = { id: 'hit-1', type: 'hit-placeholder' };
    void hit;
    const after = s.service.execute(playerId, { id: 'hit-1', type: 'action', seat: 0, action: 'hit' });
    expect(after.result.ok).toBe(true);
    v = after.view;
    expect(v.phase).toBe('SETTLEMENT');
    // principal 1000 → 2000; Buster Lucky 250 a 1:1 (dealer estourou com 3 cartas) → 500
    expect(v.me!.balance).toBe(98_750 + 2000 + 500);
    s.close();

    s = boot(file); // reinicia de novo, já liquidada
    expect(s.service.execute(playerId, { id: 'hit-1', type: 'action', seat: 0, action: 'hit' }).result).toMatchObject({ ok: true, duplicate: true });
    v = s.service.view(playerId);
    expect(v.me!.balance).toBe(101_250); // nada creditado em dobro
    expect(v.roundSummary[0]!.net).toBe(1250);
    const st = s.service.stats(playerId);
    expect(st).toMatchObject({ rounds: 1, hands: 1, wins: 1, losses: 0, pushes: 0, net: 1250, creditsAdded: 100_000 });
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM rounds').get()).toEqual({ n: 1 });
    ok(s.service, playerId, { type: 'nextRound' });
    s.close();
    s = boot(file);
    expect(s.service.view(playerId).phase).toBe('BETTING');
    expect(s.service.stats(playerId).rounds).toBe(1); // a rodada não é registrada de novo
    s.close();
  });

  it('reiniciar na oferta de Insurance mantém as decisões pendentes', () => {
    const file = tmp();
    let s = boot(file, ['10S', 'AH', '9D', 'KC']);
    const { playerId } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    ok(s.service, playerId, { type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    ok(s.service, playerId, { type: 'confirmBets', seat: 0 });
    expect(ok(s.service, playerId, { type: 'deal' }).phase).toBe('INSURANCE');
    s.close();
    s = boot(file);
    expect(s.service.view(playerId).seats[0]!.insurance.decision).toBe('pending');
    // dealer A+K = blackjack: conferido logo após a decisão, sem turnos
    expect(ok(s.service, playerId, { type: 'insurance', seat: 0, take: true }).phase).toBe('SETTLEMENT'); // 500: principal perde 1000; insurance devolve 500 + 1000
    expect(s.service.view(playerId).me!.balance).toBe(100_000 - 1000 - 500 + 1500);
    s.close();
  });
});

describe('falha de gravação', () => {
  class Flaky extends SqliteRepository {
    failNext = false;
    override saveTableState(...a: Parameters<SqliteRepository['saveTableState']>) {
      if (this.failNext) { this.failNext = false; throw new Error('disco cheio'); }
      return super.saveTableState(...a);
    }
  }
  it('nada é gravado nem fica em memória; repetir o mesmo comando funciona uma única vez', () => {
    const s = boot(tmp(), undefined, Flaky);
    const repo = s.repo as Flaky;
    const { playerId } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    repo.failNext = true;
    expect(() => s.service.execute(playerId, { id: 'bet-x', type: 'setBet', seat: 0, kind: 'main', amount: 500 })).toThrow(/disco cheio/);
    let v = s.service.view(playerId);
    expect(v.me!.balance).toBe(100_000); // memória voltou ao estado gravado
    expect(v.seats[0]!.bets.main).toBe(0);
    expect(repo.hasProcessed(playerId, 'bet-x')).toBe(false);
    expect(s.service.execute(playerId, { id: 'bet-x', type: 'setBet', seat: 0, kind: 'main', amount: 500 }).result).toEqual({ ok: true });
    expect(s.service.execute(playerId, { id: 'bet-x', type: 'setBet', seat: 0, kind: 'main', amount: 500 }).result).toMatchObject({ duplicate: true });
    v = s.service.view(playerId);
    expect(v.me!.balance).toBe(99_500);
    s.close();
  });
});

describe('estatísticas e histórico', () => {
  it('separa principal e cada side bet; retorno total ≠ lucro líquido; buy-in não é lucro', () => {
    // 8♠ 8♦ (Red/Black Pair 6:1) vs A♥+6♣ (soft 17); insurance perdido; split: 18 ganha, 17 empata
    const s = boot(tmp(), ['8S', 'AH', '8D', '6C', '10C', '9C']);
    const { playerId } = s.service.createGuest('Ana');
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    for (const [kind, amount] of [['main', 1000], ['twentyThree', 250], ['pairs', 250], ['buster', 250]] as const)
      ok(s.service, playerId, { type: 'setBet', seat: 0, kind, amount });
    ok(s.service, playerId, { type: 'confirmBets', seat: 0 });
    ok(s.service, playerId, { type: 'deal' });
    ok(s.service, playerId, { type: 'insurance', seat: 0, take: true });
    ok(s.service, playerId, { type: 'action', seat: 0, action: 'split' });
    ok(s.service, playerId, { type: 'action', seat: 0, action: 'stand' });
    ok(s.service, playerId, { type: 'action', seat: 0, action: 'stand' });
    const st = s.service.stats(playerId);
    expect(st).toMatchObject({ rounds: 1, hands: 2, wins: 1, pushes: 1, losses: 0, naturals: 0, winRate: 0.5 });
    expect(st.byKind.main).toMatchObject({ count: 2, wins: 1, stake: 2000, returned: 3000, net: 1000 });
    expect(st.byKind.pairs).toMatchObject({ count: 1, wins: 1, stake: 250, returned: 1750, net: 1500 });
    expect(st.byKind.twentyThree).toMatchObject({ wins: 0, stake: 250, returned: 0, net: -250 });
    expect(st.byKind.buster).toMatchObject({ wins: 0, net: -250 });
    expect(st.byKind.insurance).toMatchObject({ stake: 500, returned: 0, net: -500 });
    expect(st.stake).toBe(3250);
    expect(st.returned).toBe(4750);
    expect(st.net).toBe(1500); // retorno total (4750) − apostado (3250)
    expect(st.creditsAdded).toBe(100_000); // buy-in fica de fora do resultado
    expect(s.service.view(playerId).me!.balance).toBe(100_000 + 1500);

    const h = s.service.history(playerId, 10);
    expect(h).toHaveLength(1);
    expect(h[0]!.net).toBe(1500);
    expect(h[0]!.seats).toHaveLength(1);
    expect(h[0]!.seats[0]!.hands.map((x) => [x.index, x.fromSplit, x.bet])).toEqual([[0, true, 1000], [1, true, 1000]]);
    expect(h[0]!.seats[0]!.results).toHaveLength(6);
    expect(h[0]!.dealer.map((x) => x.rank)).toEqual(['A', '6']);
    s.close();
  });

  it('blackjack natural é contado; jogador sem rodadas tem estatísticas zeradas', () => {
    const s = boot(tmp(), ['AS', '9D', 'KH', '8C']);
    const { playerId } = s.service.createGuest('Ana');
    const empty = s.service.stats(playerId);
    expect(empty).toMatchObject({ rounds: 0, hands: 0, winRate: null, net: 0 });
    ok(s.service, playerId, { type: 'buyIn', amount: 100_000 });
    ok(s.service, playerId, { type: 'takeSeat', seat: 0 });
    ok(s.service, playerId, { type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    ok(s.service, playerId, { type: 'confirmBets', seat: 0 });
    ok(s.service, playerId, { type: 'deal' });
    const st = s.service.stats(playerId);
    expect(st).toMatchObject({ naturals: 1, wins: 1, net: 1500 });
    s.close();
  });

  it('estatísticas de um jogador não incluem as de outro', () => {
    const s = boot(tmp(), ['AS', '10S', '9D', 'KH', '8C', '8D']);
    const a = s.service.createGuest('A'), b = s.service.createGuest('B');
    for (const [p, seat] of [[a.playerId, 0], [b.playerId, 1]] as const) {
      ok(s.service, p, { type: 'buyIn', amount: 100_000 });
      ok(s.service, p, { type: 'takeSeat', seat });
      ok(s.service, p, { type: 'setBet', seat, kind: 'main', amount: 1000 });
      ok(s.service, p, { type: 'confirmBets', seat });
    }
    ok(s.service, a.playerId, { type: 'deal' });
    ok(s.service, b.playerId, { type: 'action', seat: 1, action: 'stand' }); // a rodada só é registrada ao terminar
    expect(s.service.stats(a.playerId).naturals).toBe(1);
    expect(s.service.stats(b.playerId).naturals).toBe(0);
    expect(s.service.history(b.playerId, 5).every((r) => r.seats.every((x) => x.seat === 1))).toBe(true);
    s.close();
  });
});

describe('preferências', () => {
  it('padrões, atualização parcial e validação', () => {
    const s = boot(tmp());
    const { playerId } = s.service.createGuest('Ana');
    expect(s.service.getPreferences(playerId)).toMatchObject({ sound: true, vibration: true, animationSpeed: 'normal', reducedMotion: 'system', trainingHints: true, tutorialSeen: false });
    s.service.setPreferences(playerId, { vibration: false });
    s.service.setPreferences(playerId, { tutorialSeen: true });
    expect(s.service.getPreferences(playerId)).toMatchObject({ vibration: false, tutorialSeen: true, sound: true });
    for (const bad of [{ nope: 1 }, { sound: 'sim' }, { animationSpeed: 'lento' }, [], null, 'x'])
      expect(() => s.service.setPreferences(playerId, bad)).toThrow();
    s.close();
  });
});
