import { describe, it, expect } from 'vitest';
import { mkTable, sit } from './helpers';
import { toView } from '../src';

const act = (h: ReturnType<typeof mkTable>, seat: number, action: any) => h.ok({ type: 'action', seat, action });

describe('buy-in e rebuy', () => {
  it('aceita até R$ 1.000,00 por operação e registra no histórico', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 100_000, name: 'Ana' });
    expect(h.t.seats[0]!.balance).toBe(100_000);
    expect(h.t.seats[0]!.ledger).toHaveLength(1);
    expect(h.t.seats[0]!.ledger[0]).toMatchObject({ type: 'buyIn', amount: 100_000, balanceAfter: 100_000 });
    expect(typeof h.t.seats[0]!.ledger[0]!.at).toBe('string');
  });
  it('rejeita valores acima do limite, zero, negativos e não inteiros', () => {
    const h = mkTable([]);
    expect(h.run({ type: 'buyIn', seat: 0, amount: 100_001 })).toMatchObject({ ok: false, code: 'EXCEEDS_MAX_BUYIN' });
    for (const amount of [0, -1, 1.5, NaN, Infinity, '500' as any])
      expect(h.run({ type: 'buyIn', seat: 0, amount })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(h.t.seats[0]!.player).toBeNull();
    expect(h.t.seats[0]!.balance).toBe(0);
  });
  it('rebuy acumula saldo acima de R$ 1.000,00 (limite é por operação)', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 1, amount: 100_000 });
    h.ok({ type: 'rebuy', seat: 1, amount: 100_000 });
    h.ok({ type: 'rebuy', seat: 1, amount: 50_000 });
    expect(h.t.seats[1]!.balance).toBe(250_000);
    expect(h.t.seats[1]!.ledger.map((l) => l.type)).toEqual(['buyIn', 'rebuy', 'rebuy']);
    expect(h.run({ type: 'rebuy', seat: 1, amount: 100_001 })).toMatchObject({ ok: false, code: 'EXCEEDS_MAX_BUYIN' });
  });
  it('bloqueia buy-in em lugar ocupado e rebuy em lugar vazio', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 1000 });
    expect(h.run({ type: 'buyIn', seat: 0, amount: 1000 })).toMatchObject({ ok: false, code: 'SEAT_OCCUPIED' });
    expect(h.run({ type: 'rebuy', seat: 2, amount: 1000 })).toMatchObject({ ok: false, code: 'SEAT_EMPTY' });
    expect(h.t.seats[0]!.balance).toBe(1000);
  });
  it('não processa a mesma solicitação duas vezes', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 1000, id: 'x1' });
    h.ok({ type: 'rebuy', seat: 0, amount: 5000, id: 'x2' });
    const dup = h.run({ type: 'rebuy', seat: 0, amount: 5000, id: 'x2' });
    expect(dup).toMatchObject({ ok: true, duplicate: true });
    expect(h.t.seats[0]!.balance).toBe(6000);
    expect(h.t.seats[0]!.ledger).toHaveLength(2);
  });
  it('rebuy só entre rodadas e antes de confirmar as apostas', () => {
    const h = mkTable(['10S', '10H', '9D', '8C', '2D']);
    h.ok({ type: 'buyIn', seat: 0, amount: 10_000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    expect(toView(h.t).seats[0]!.canRebuy).toBe(true);
    h.ok({ type: 'confirmBets', seat: 0 });
    expect(toView(h.t).seats[0]!.canRebuy).toBe(false);
    expect(h.run({ type: 'rebuy', seat: 0, amount: 1000 })).toMatchObject({ ok: false, code: 'BETS_CONFIRMED' });
    h.ok({ type: 'deal' });
    expect(h.run({ type: 'rebuy', seat: 0, amount: 1000 })).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(h.t.seats[0]!.balance).toBe(9500);
  });
});

describe('apostas', () => {
  it('valida mínimos, centavos pares, saldo e side bet sem principal', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 1000 });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'main', amount: 499 })).toMatchObject({ code: 'BELOW_MIN_BET' });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'main', amount: 501 })).toMatchObject({ code: 'ODD_MAIN_BET' });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'main', amount: 1002 })).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'buster', amount: 250 })).toMatchObject({ code: 'NO_MAIN_BET' });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'pairs', amount: 249 })).toMatchObject({ code: 'BELOW_MIN_BET' });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'pairs', amount: 501 })).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    h.ok({ type: 'setBet', seat: 0, kind: 'pairs', amount: 250 });
    expect(h.t.seats[0]!.balance).toBe(250);
    expect(h.run({ type: 'setBet', seat: 0, kind: 'nope' as any, amount: 250 })).toMatchObject({ ok: false });
    expect(h.run({ type: 'setBet', seat: 7, kind: 'main', amount: 500 })).toMatchObject({ code: 'INVALID_SEAT' });
  });
  it('retirar a principal cancela e devolve as side bets', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 5000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'twentyThree', amount: 250 });
    h.ok({ type: 'setBet', seat: 0, kind: 'buster', amount: 500 });
    expect(h.t.seats[0]!.balance).toBe(3250);
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 0 });
    expect(h.t.seats[0]!.balance).toBe(5000);
    expect(h.t.seats[0]!.bets).toEqual({ main: 0, twentyThree: 0, pairs: 0, buster: 0 });
  });
  it('limpar apostas devolve tudo; alterar ajusta pelo delta', () => {
    const h = mkTable([]);
    h.ok({ type: 'buyIn', seat: 0, amount: 5000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 600 });
    expect(h.t.seats[0]!.balance).toBe(4400);
    h.ok({ type: 'clearBets', seat: 0 });
    expect(h.t.seats[0]!.balance).toBe(5000);
  });
  it('não altera apostas depois de confirmar nem depois do início da rodada', () => {
    const h = mkTable(['10S', '10H', '9D', '8C', '2D']);
    sit(h, 0, 5000, { main: 500 });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'main', amount: 1000 })).toMatchObject({ code: 'BETS_LOCKED' });
    h.ok({ type: 'deal' });
    expect(h.run({ type: 'setBet', seat: 0, kind: 'main', amount: 1000 })).toMatchObject({ code: 'WRONG_PHASE' });
    expect(h.run({ type: 'clearBets', seat: 0 })).toMatchObject({ code: 'WRONG_PHASE' });
  });
  it('não distribui com apostas não confirmadas', () => {
    const h = mkTable(['10S', '10H', '9D', '8C']);
    h.ok({ type: 'buyIn', seat: 0, amount: 5000 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500 });
    expect(h.run({ type: 'deal' })).toMatchObject({ code: 'SEATS_NOT_CONFIRMED' });
    expect(h.run({ type: 'confirmBets', seat: 1 })).toMatchObject({ code: 'SEAT_EMPTY' });
  });
});

describe('blackjack natural e pagamentos básicos', () => {
  // ordem: seat0 c1, dealer up, seat0 c2, dealer hole, depois compras
  it('natural paga 3:2', () => {
    const h = mkTable(['AS', '9D', 'KH', '8C']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.phase).toBe('SETTLEMENT');
    expect(h.t.seats[0]!.balance).toBe(4000 + 1000 + 1500);
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'blackjack', payout: 2500 });
  });
  it('natural empata com blackjack do dealer', () => {
    const h = mkTable(['AS', '10D', 'KH', 'AC']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.seats[0]!.balance).toBe(5000);
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'push' });
  });
  it('21 após split NÃO é blackjack natural (paga 1:1)', () => {
    // 10,10 vs dealer 9/8=17. Split 10s: mão1 10+A=21, mão2 10+K=20.
    const h = mkTable(['10S', '9D', '10H', '8C', 'AD', 'KC']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    act(h, 0, 'split');
    expect(h.t.seats[0]!.hands.map((x) => x.status)).toEqual(['stood', 'playing']);
    act(h, 0, 'stand');
    const r = h.t.seats[0]!.results;
    expect(r[0]).toMatchObject({ handIndex: 0, outcome: 'win', payout: 2000 });
    expect(r[1]).toMatchObject({ handIndex: 1, outcome: 'win', payout: 2000 });
    expect(h.t.seats[0]!.balance).toBe(3000 + 4000);
  });
  it('Ás vale 11 ou 1 na mão jogada', () => {
    // A,5 (soft 16) hit 9 → 15 hard; hit 6 → 21
    const h = mkTable(['AS', '10D', '5H', '7C', '9D', '6C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'hit');
    expect(toView(h.t).seats[0]!.hands[0]!.value).toEqual({ total: 15, soft: false, bust: false });
    act(h, 0, 'hit');
    expect(h.t.seats[0]!.hands[0]!.status).toBe('stood'); // 21 encerra automaticamente
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'win' });
  });
  it('empate devolve, derrota perde, estouro perde', () => {
    const h = mkTable(['10S', '10D', '9H', '8C', '10C', '9C']); // p 19 vs dealer 18... 
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'win' });
    const g = mkTable(['10S', '10D', '6H', '9C', '10C']);
    sit(g, 0, 5000, { main: 500 });
    g.ok({ type: 'deal' });
    act(g, 0, 'hit');
    expect(g.t.seats[0]!.results[0]).toMatchObject({ outcome: 'bust', payout: 0 });
    expect(g.t.seats[0]!.balance).toBe(4500);
    const p = mkTable(['10S', '10D', '8H', '8C']);
    sit(p, 0, 5000, { main: 500 });
    p.ok({ type: 'deal' });
    act(p, 0, 'stand');
    expect(p.t.seats[0]!.results[0]).toMatchObject({ outcome: 'push' });
    expect(p.t.seats[0]!.balance).toBe(5000);
  });
});

describe('dealer', () => {
  it('para no soft 17', () => {
    // dealer A + 6 = soft 17
    const h = mkTable(['10S', 'AD', '9H', '6C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: false });
    act(h, 0, 'stand');
    expect(h.t.dealer.cards).toHaveLength(2);
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'win' }); // 19 > 17
  });
  it('compra em soft 16 e em 16 duro, e estoura pagando 1:1', () => {
    const h = mkTable(['10S', 'AD', '9H', '5C', '10D']); // soft16 + 10 = hard 16 → compra
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: false });
    // dealer A,5 (soft 16) tem de comprar: o shoe de teste acaba na carta seguinte
    expect(() => act(h, 0, 'stand')).toThrow('SHOE_EMPTY');
  });
  it('dealer estoura: mãos vivas ganham', () => {
    const h = mkTable(['10S', '10D', '9H', '6C', '10H']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    expect(h.t.dealer.cards).toHaveLength(3);
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'win', label: 'Dealer estourou', payout: 1000 });
  });
  it('dealer com blackjack (sem peek): perde tudo, inclusive Double e Split', () => {
    // seat0: 5+6=11, dealer A up / K hole. Double → 10 => 21? use 4: 5,6,+4 = 15
    const h = mkTable(['5S', 'AD', '6H', 'KC', '4D']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: false });
    act(h, 0, 'double');
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'lose', stake: 2000, payout: 0 });
    expect(h.t.seats[0]!.balance).toBe(3000);
  });
  it('blackjack do dealer com 10 aberto e Ás fechado também vale como blackjack', () => {
    const h = mkTable(['10S', 'KD', '8H', 'AC']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'lose' });
  });
  it('dealer não compra se todas as mãos estouraram e ninguém apostou Buster', () => {
    const h = mkTable(['10S', '6D', '6H', '5C', '10D']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'hit');
    expect(h.t.dealer.cards).toHaveLength(2);
    expect(h.t.phase).toBe('SETTLEMENT');
  });
});

describe('split', () => {
  it('limite global de 3 splits (4 mãos), contando mãos derivadas', () => {
    // seat0 8,8 ; dealer 6/10 ; cada split recebe 8 → sempre par
    const seq = ['8S', '6D', '8H', '10C', '8D', '8C', '8S', '8H', '8D', '8C', '2S'];
    const h = mkTable(seq);
    sit(h, 0, 10_000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'split');
    act(h, 0, 'split'); // mão 0 (8,8) de novo
    act(h, 0, 'split');
    const s = h.t.seats[0]!;
    expect(s.splits).toBe(3);
    expect(s.hands).toHaveLength(4);
    expect(s.balance).toBe(10_000 - 500 * 4);
    expect(h.t.legalActions()).not.toContain('split'); // mão atual ainda é par, mas o limite acabou
    expect(h.run({ type: 'action', seat: 0, action: 'split' })).toMatchObject({ ok: false, code: 'ILLEGAL_ACTION' });
    expect(s.hands).toHaveLength(4);
  });
  it('split exige saldo para a aposta adicional', () => {
    const h = mkTable(['8S', '6D', '8H', '10C', '2D', '3C']);
    sit(h, 0, 500, { main: 500 });
    h.ok({ type: 'deal' });
    expect(h.t.legalActions()).not.toContain('split');
    expect(h.t.legalActions()).not.toContain('double');
  });
  it('split de ases: uma carta por mão e fim das ações (sem Hit/Double)', () => {
    const h = mkTable(['AS', '6D', 'AH', '10C', '5D', '9C', '10H']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'split');
    const s = h.t.seats[0]!;
    expect(s.hands.map((x) => x.cards.length)).toEqual([2, 2]);
    expect(s.hands.map((x) => x.status)).toEqual(['stood', 'stood']);
    expect(h.t.phase).toBe('SETTLEMENT'); // dealer jogou: 6+10=16 → compra 10 → estoura
    expect(s.results.filter((r) => r.kind === 'main')).toHaveLength(2);
  });
  it('resplit de ases é permitido (até o limite global) e a mão de ases fica só com split/stand', () => {
    const h = mkTable(['AS', '6D', 'AH', '10C', 'AD', '9C', '5S', '7H', '10H']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'split'); // mão0: A,A ; mão1: A,9
    expect(h.t.legalActions().sort()).toEqual(['split', 'stand']);
    expect(h.run({ type: 'action', seat: 0, action: 'hit' })).toMatchObject({ code: 'ILLEGAL_ACTION' });
    expect(h.run({ type: 'action', seat: 0, action: 'double' })).toMatchObject({ code: 'ILLEGAL_ACTION' });
    act(h, 0, 'split');
    expect(h.t.seats[0]!.splits).toBe(2);
    expect(h.t.seats[0]!.hands).toHaveLength(3);
  });
  it('Double após split é permitido, exceto em mãos de ases', () => {
    const h = mkTable(['8S', '6D', '8H', '10C', '3D', '2C', '9S', '9H']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'split'); // 8,3 e 8,2
    expect(h.t.legalActions()).toContain('double');
    act(h, 0, 'double'); // 8,3,9 = 20
    expect(h.t.seats[0]!.hands[0]).toMatchObject({ bet: 1000, doubled: true, status: 'stood' });
    const a = mkTable(['AS', '6D', 'AH', '10C', '5D', '5C', '9S']);
    sit(a, 0, 5000, { main: 500 });
    a.ok({ type: 'deal' });
    act(a, 0, 'split');
    expect(a.run({ type: 'action', seat: 0, action: 'double' })).toMatchObject({ ok: false });
  });
});

describe('surrender', () => {
  it('só como primeira decisão; devolve metade', () => {
    const h = mkTable(['10S', '10D', '6H', '7C']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.legalActions()).toContain('surrender');
    act(h, 0, 'surrender');
    expect(h.t.seats[0]!.balance).toBe(4500);
    expect(h.t.seats[0]!.results[0]).toMatchObject({ outcome: 'surrender', payout: 500 });
  });
  it('não é permitido depois de Hit nem depois de split', () => {
    const h = mkTable(['5S', '10D', '4H', '7C', '2D']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    act(h, 0, 'hit');
    expect(h.run({ type: 'action', seat: 0, action: 'surrender' })).toMatchObject({ code: 'ILLEGAL_ACTION' });
    const s = mkTable(['8S', '10D', '8H', '7C', '2D', '3C']);
    sit(s, 0, 5000, { main: 1000 });
    s.ok({ type: 'deal' });
    act(s, 0, 'split');
    expect(s.t.legalActions()).not.toContain('surrender');
  });
  it('early: devolve metade mesmo que o dealer tenha blackjack', () => {
    const h = mkTable(['10S', 'AD', '6H', 'KC']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: false });
    act(h, 0, 'surrender');
    expect(h.t.seats[0]!.balance).toBe(4500);
    expect(h.t.seats[0]!.results.filter((r) => r.kind === 'main')).toHaveLength(1);
  });
});

describe('insurance', () => {
  it('só é oferecido com Ás aberto; valor é metade da principal; paga 2:1', () => {
    const none = mkTable(['10S', '10D', '6H', 'AC']);
    sit(none, 0, 5000, { main: 1000 });
    none.ok({ type: 'deal' });
    expect(none.t.phase).toBe('PLAYER_TURNS');
    expect(none.run({ type: 'insurance', seat: 0, take: true })).toMatchObject({ code: 'WRONG_PHASE' });

    const h = mkTable(['10S', 'AD', '6H', 'KC']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.phase).toBe('INSURANCE');
    h.ok({ type: 'insurance', seat: 0, take: true });
    expect(h.t.seats[0]!.insurance).toBe(500);
    expect(h.t.seats[0]!.balance).toBe(3500);
    act(h, 0, 'stand');
    // principal perdida (16 vs BJ) ; insurance devolve 500 + 1000 = 1500
    expect(h.t.seats[0]!.balance).toBe(5000);
    expect(h.t.seats[0]!.results.find((r) => r.kind === 'insurance')).toMatchObject({ outcome: 'win', payout: 1500 });
  });
  it('perde se o dealer não tem blackjack; decisão repetida é rejeitada', () => {
    const h = mkTable(['10S', 'AD', '9H', '5C', '3D', '10C']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: true });
    expect(h.run({ type: 'insurance', seat: 0, take: true })).toMatchObject({ code: 'WRONG_PHASE' });
    expect(h.t.seats[0]!.balance).toBe(3500);
    act(h, 0, 'stand');
    expect(h.t.seats[0]!.results.find((r) => r.kind === 'insurance')).toMatchObject({ outcome: 'lose', payout: 0 });
  });
  it('sem saldo para insurance → recusado automaticamente', () => {
    const h = mkTable(['10S', 'AD', '9H', '5C', '3D']);
    sit(h, 0, 1000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.seats[0]!.insuranceDecision).toBe('declined');
    expect(h.t.phase).toBe('PLAYER_TURNS');
  });
});

describe('turnos e idempotência', () => {
  it('ação fora da vez é rejeitada sem mexer no saldo', () => {
    const h = mkTable(['5S', '5H', '10D', '7C', '6D', '4C']);
    sit(h, 0, 5000, { main: 500 });
    sit(h, 1, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    expect(h.run({ type: 'action', seat: 1, action: 'double' })).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(h.t.seats[1]!.balance).toBe(4500);
    expect(h.run({ type: 'action', seat: 3, action: 'hit' })).toMatchObject({ code: 'SEAT_EMPTY' });
  });
  it('ação repetida (mesmo id) não debita duas vezes', () => {
    const h = mkTable(['5S', '10D', '6H', '7C', '10H', '2D']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'action', seat: 0, action: 'double', id: 'dbl-1' });
    expect(h.t.seats[0]!.balance).toBe(4000 + 2000);
    const again = h.run({ type: 'action', seat: 0, action: 'double', id: 'dbl-1' });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    // 5+6+10 = 21 ganha do dealer (17): 1000 apostado → 2000 de retorno, creditado uma única vez
    expect(h.t.seats[0]!.balance).toBe(4000 + 2000);
    expect(h.t.seats[0]!.results.filter((r) => r.kind === 'main')).toHaveLength(1);
  });
  it('mão encerrada não aceita nova ação', () => {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    expect(h.run({ type: 'action', seat: 0, action: 'hit' })).toMatchObject({ code: 'WRONG_PHASE' });
    expect(h.run({ type: 'action', seat: 0, action: 'fly' as any })).toMatchObject({ ok: false });
  });
  it('próxima rodada limpa apostas e mantém o saldo', () => {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    const bal = h.t.seats[0]!.balance;
    h.ok({ type: 'nextRound' });
    expect(h.t.phase).toBe('BETTING');
    expect(h.t.seats[0]).toMatchObject({ balance: bal, confirmed: false, hands: [] });
    expect(h.t.seats[0]!.ledger).toHaveLength(1);
  });
  it('view esconde a carta fechada do dealer até a revelação', () => {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    expect(toView(h.t).dealer.cards[1]).toBeNull();
    act(h, 0, 'stand');
    expect(toView(h.t).dealer.cards[1]).not.toBeNull();
    expect(JSON.stringify(toView(h.t))).not.toContain('"shoe"');
  });
});

describe('side bets na rodada', () => {
  it('23+1 e Pares liquidam logo após a distribuição, cada uma com seu resultado', () => {
    // seat0: KH KS (par coloured? K♥ K♠ = red/black), dealer up KD → three of a kind (30:1)
    const h = mkTable(['KH', 'KD', 'KS', '5C']);
    sit(h, 0, 5000, { main: 500, twentyThree: 250, pairs: 250 });
    h.ok({ type: 'deal' });
    const r = h.t.seats[0]!.results;
    expect(r.find((x) => x.kind === 'twentyThree')).toMatchObject({ outcome: 'win', payout: 250 * 31 });
    expect(r.find((x) => x.kind === 'pairs')).toMatchObject({ outcome: 'win', payout: 250 * 7 });
    expect(h.t.phase).toBe('PLAYER_TURNS');
  });
  it('Buster Lucky: mesmo resultado para todos, respeitando o valor de cada lugar', () => {
    const t = mkTable([
      '10S', '10C', // seat0 c1, seat1 c1
      '6D',          // dealer up
      '9S', '8C',    // seat0 c2, seat1 c2
      '5H',          // dealer hole → 11
      'AD', '2D', '2S', '10C', // dealer compra: 12, 14, 16, 26 → 6 cartas, estoura
    ]);
    sit(t, 0, 5000, { main: 500, buster: 250 });
    sit(t, 1, 5000, { main: 500, buster: 500 });
    t.ok({ type: 'deal' });
    act(t, 0, 'stand');
    act(t, 1, 'stand');
    expect(t.t.dealer.cards).toHaveLength(6);
    expect(t.t.seats[0]!.results.find((r) => r.kind === 'buster')).toMatchObject({ outcome: 'win', payout: 250 * 31 });
    expect(t.t.seats[1]!.results.find((r) => r.kind === 'buster')).toMatchObject({ outcome: 'win', payout: 500 * 31 });
  });
  it('Buster Lucky perde se o dealer não estoura, e dealer joga mesmo com todas as mãos estouradas', () => {
    const t = mkTable(['10S', '6D', '6H', '5C', '10D', '9H', '3C', '10C']);
    sit(t, 0, 5000, { main: 500, buster: 250 });
    t.ok({ type: 'deal' });
    act(t, 0, 'hit'); // 6,6,10 = 22 estoura
    expect(t.t.dealer.cards.length).toBeGreaterThan(2); // dealer jogou por causa da Buster
    expect(t.t.seats[0]!.results.find((r) => r.kind === 'buster')).toBeDefined();
  });
});
