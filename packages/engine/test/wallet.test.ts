import { describe, it, expect } from 'vitest';
import { mkTable, join, seatPlayer, bet, sit, pid } from './helpers';
import { toView } from '../src';

const act = (h: ReturnType<typeof mkTable>, seat: number, action: any) => h.ok({ type: 'action', seat, action });
const take = (h: ReturnType<typeof mkTable>, playerId: string, seat: number) => h.ok({ type: 'takeSeat', playerId, seat });

describe('buy-in e rebuy na carteira do jogador', () => {
  it('buy-in inicial até R$ 1.000,00, registrado no histórico', () => {
    const h = mkTable([]);
    h.ok({ type: 'setName', playerId: 'ana', name: 'Ana' });
    h.ok({ type: 'buyIn', playerId: 'ana', amount: 100_000 });
    const p = h.t.players.get('ana')!;
    expect(p.balance).toBe(100_000);
    expect(p.ledger[0]).toMatchObject({ type: 'buyIn', amount: 100_000, balanceAfter: 100_000 });
    expect(typeof p.ledger[0]!.at).toBe('string');
  });
  it('rejeita acima do limite, zero, negativo e não inteiro', () => {
    const h = mkTable([]);
    h.ok({ type: 'setName', playerId: 'ana', name: 'Ana' });
    expect(h.run({ type: 'buyIn', playerId: 'ana', amount: 100_001 })).toMatchObject({ ok: false, code: 'EXCEEDS_MAX_BUYIN' });
    for (const amount of [0, -1, 1.5, NaN, Infinity, '500' as any])
      expect(h.run({ type: 'buyIn', playerId: 'ana', amount })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(h.bal(0)).toBe(0);
    expect(h.t.players.get('ana')!.ledger).toHaveLength(0);
  });
  it('buy-in inicial só uma vez; rebuy exige carteira; rebuy acumula acima de R$ 1.000,00', () => {
    const h = mkTable([]);
    h.ok({ type: 'setName', playerId: 'ana', name: 'Ana' });
    expect(h.run({ type: 'rebuy', playerId: 'ana', amount: 1000 })).toMatchObject({ code: 'NO_WALLET' });
    h.ok({ type: 'buyIn', playerId: 'ana', amount: 100_000 });
    expect(h.run({ type: 'buyIn', playerId: 'ana', amount: 1000 })).toMatchObject({ code: 'ALREADY_BOUGHT_IN' });
    h.ok({ type: 'rebuy', playerId: 'ana', amount: 100_000 });
    h.ok({ type: 'rebuy', playerId: 'ana', amount: 50_000 });
    expect(h.t.balanceOf('ana')).toBe(250_000);
    expect(h.t.players.get('ana')!.ledger.map((l) => l.type)).toEqual(['buyIn', 'rebuy', 'rebuy']);
    expect(h.run({ type: 'rebuy', playerId: 'ana', amount: 100_001 })).toMatchObject({ code: 'EXCEEDS_MAX_BUYIN' });
  });
  it('não processa a mesma solicitação duas vezes', () => {
    const h = mkTable([]);
    h.ok({ type: 'setName', playerId: 'ana', name: 'Ana' });
    h.ok({ type: 'buyIn', playerId: 'ana', amount: 1000, id: 'x1' });
    h.ok({ type: 'rebuy', playerId: 'ana', amount: 5000, id: 'x2' });
    expect(h.run({ type: 'rebuy', playerId: 'ana', amount: 5000, id: 'x2' })).toMatchObject({ ok: true, duplicate: true });
    expect(h.t.balanceOf('ana')).toBe(6000);
    expect(h.t.players.get('ana')!.ledger).toHaveLength(2);
  });
  it('rebuy só entre rodadas e antes de confirmar as apostas (de qualquer lugar do jogador)', () => {
    const h = mkTable(['10S', '10H', '9D', '8C', '2D']);
    seatPlayer(h, 0, 10_000);
    bet(h, 0, { main: 500 });
    expect(toView(h.t, 'P0').me!.canRebuy).toBe(true);
    h.ok({ type: 'confirmBets', seat: 0 });
    expect(toView(h.t, 'P0').me!.canRebuy).toBe(false);
    expect(h.run({ type: 'rebuy', playerId: 'P0', amount: 1000 })).toMatchObject({ code: 'BETS_CONFIRMED' });
    h.ok({ type: 'deal' });
    expect(h.run({ type: 'rebuy', playerId: 'P0', amount: 1000 })).toMatchObject({ code: 'WRONG_PHASE' });
    expect(h.bal(0)).toBe(9500);
  });
  it('takeSeat exige jogador conhecido e buy-in feito; lugar ocupado é recusado', () => {
    const h = mkTable([]);
    expect(h.run({ type: 'takeSeat', playerId: 'ninguem', seat: 0 })).toMatchObject({ code: 'UNKNOWN_PLAYER' });
    h.ok({ type: 'setName', playerId: 'ana', name: 'Ana' });
    expect(h.run({ type: 'takeSeat', playerId: 'ana', seat: 0 })).toMatchObject({ code: 'NO_BUYIN' });
    h.ok({ type: 'buyIn', playerId: 'ana', amount: 1000 });
    take(h, 'ana', 0);
    join(h, 'bia', 1000);
    expect(h.run({ type: 'takeSeat', playerId: 'bia', seat: 0 })).toMatchObject({ code: 'SEAT_OCCUPIED' });
    expect(h.run({ type: 'takeSeat', playerId: 'bia', seat: 9 })).toMatchObject({ code: 'INVALID_SEAT' });
  });
});

describe('uma carteira por jogador, vários lugares', () => {
  it('todos os lugares consomem a MESMA carteira (sem saldo independente por lugar)', () => {
    const h = mkTable([]);
    join(h, 'ana', 1200); // R$ 12,00
    take(h, 'ana', 0); take(h, 'ana', 1); take(h, 'ana', 2);
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 600 });
    expect(h.t.balanceOf('ana')).toBe(600);
    expect(h.run({ type: 'setBet', seat: 1, kind: 'main', amount: 700 })).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    h.ok({ type: 'setBet', seat: 1, kind: 'main', amount: 600 });
    expect(h.t.balanceOf('ana')).toBe(0);
    expect(h.run({ type: 'setBet', seat: 2, kind: 'main', amount: 500 })).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    // retirar uma aposta devolve à carteira compartilhada, que o outro lugar passa a poder usar
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 0 });
    expect(h.t.balanceOf('ana')).toBe(600);
    h.ok({ type: 'setBet', seat: 2, kind: 'main', amount: 500 });
    expect(h.t.balanceOf('ana')).toBe(100);
  });
  it('side bets também saem da carteira única; retirar a principal devolve tudo', () => {
    const h = mkTable([]);
    join(h, 'ana', 5000);
    take(h, 'ana', 0); take(h, 'ana', 4);
    bet(h, 0, { main: 1000, twentyThree: 250, buster: 500 });
    expect(h.t.balanceOf('ana')).toBe(3250);
    bet(h, 4, { main: 3000 });
    expect(h.t.balanceOf('ana')).toBe(250);
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 0 });
    expect(h.t.balanceOf('ana')).toBe(2000);
  });
  it('sair de um lugar entre rodadas devolve as apostas, libera o lugar e mantém a carteira', () => {
    const h = mkTable([]);
    join(h, 'ana', 5000);
    take(h, 'ana', 0); take(h, 'ana', 1);
    bet(h, 0, { main: 1000, pairs: 250 });
    bet(h, 1, { main: 500 });
    h.ok({ type: 'confirmBets', seat: 0 });
    h.ok({ type: 'leave', seat: 0 });
    expect(h.t.seats[0]!.playerId).toBeNull();
    expect(h.t.seats[0]!.bets).toEqual({ main: 0, twentyThree: 0, pairs: 0, buster: 0 });
    expect(h.t.balanceOf('ana')).toBe(4500); // 5000 - 500 (lugar 2 ainda apostado)
    expect(h.t.players.get('ana')!.ledger).toHaveLength(1);
    expect(h.t.seats[1]!.playerId).toBe('ana');
  });
  it('mãos de split usam a mesma carteira e o Double também', () => {
    // dois lugares do mesmo jogador com carteira exata: sem saldo, sem Double/Split
    const h = mkTable(['8S', '8H', '6D', '8D', '8C', '10C']);
    join(h, 'ana', 1000);
    take(h, 'ana', 0); take(h, 'ana', 1);
    bet(h, 0, { main: 500 });
    bet(h, 1, { main: 500 });
    h.ok({ type: 'confirmBets', seat: 0 });
    h.ok({ type: 'confirmBets', seat: 1 });
    h.ok({ type: 'deal' });
    expect(h.t.balanceOf('ana')).toBe(0);
    expect(h.t.legalActions()).not.toContain('split');
    expect(h.t.legalActions()).not.toContain('double');
    expect(h.run({ type: 'action', seat: 0, action: 'split' })).toMatchObject({ code: 'ILLEGAL_ACTION' });
    expect(h.t.balanceOf('ana')).toBe(0);
  });
  it('split debita a carteira compartilhada (com saldo sobrando)', () => {
    const h = mkTable(['8S', '8H', '6D', '8D', '8C', '10C', '2C', '3C']);
    join(h, 'ana', 5000);
    take(h, 'ana', 0); take(h, 'ana', 1);
    bet(h, 0, { main: 500 }); bet(h, 1, { main: 500 });
    h.ok({ type: 'confirmBets', seat: 0 }); h.ok({ type: 'confirmBets', seat: 1 });
    h.ok({ type: 'deal' });
    expect(h.t.balanceOf('ana')).toBe(4000);
    expect(h.t.legalActions()).toContain('split');
    act(h, 0, 'split');
    expect(h.t.balanceOf('ana')).toBe(3500);
  });
  it('jogador só age nos próprios lugares', () => {
    const h = mkTable([]);
    join(h, 'ana', 5000); join(h, 'bia', 5000);
    take(h, 'ana', 0);
    expect(h.run({ type: 'setBet', playerId: 'bia', seat: 0, kind: 'main', amount: 500 })).toMatchObject({ code: 'NOT_SEAT_OWNER' });
    expect(h.run({ type: 'leave', playerId: 'bia', seat: 0 })).toMatchObject({ code: 'NOT_SEAT_OWNER' });
    expect(h.run({ type: 'confirmBets', playerId: 'bia', seat: 0 })).toMatchObject({ code: 'NOT_SEAT_OWNER' });
    expect(h.t.balanceOf('bia')).toBe(5000);
  });
  it('cliques repetidos (mesmo id) não debitam duas vezes', () => {
    const h = mkTable([]);
    join(h, 'ana', 5000); take(h, 'ana', 0);
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500, id: 'b1' });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500, id: 'b1' });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 500, id: 'b1' });
    expect(h.t.balanceOf('ana')).toBe(4500);
  });
});

describe('identidade e nome', () => {
  it('editar o nome não cria outra carteira nem muda saldo, histórico ou lugares', () => {
    const h = mkTable([]);
    join(h, 'ana-id', 5000, 'Ana');
    take(h, 'ana-id', 0); take(h, 'ana-id', 3);
    bet(h, 0, { main: 500 });
    const before = { bal: h.t.balanceOf('ana-id'), ledger: JSON.stringify(h.t.players.get('ana-id')!.ledger) };
    h.ok({ type: 'setName', playerId: 'ana-id', name: 'Ana Maria' });
    expect(h.t.players.size).toBe(1);
    expect(h.t.balanceOf('ana-id')).toBe(before.bal);
    expect(JSON.stringify(h.t.players.get('ana-id')!.ledger)).toBe(before.ledger);
    expect(h.t.seats[0]!.playerId).toBe('ana-id');
    expect(h.t.seats[0]!.bets.main).toBe(500);
    const v = toView(h.t, 'ana-id');
    expect(v.me!.name).toBe('Ana Maria');
    expect(v.seats[0]!.playerName).toBe('Ana Maria');
    expect(v.seats[3]!.playerName).toBe('Ana Maria'); // atualiza em todos os lugares do jogador
    expect(v.seats[1]!.playerName).toBeNull();
  });
  it('mesmo nome em ids diferentes = carteiras diferentes; nome vazio é recusado', () => {
    const h = mkTable([]);
    join(h, 'a', 1000, 'Ana'); join(h, 'b', 2000, 'Ana');
    expect(h.t.players.size).toBe(2);
    expect(h.t.balanceOf('a')).toBe(1000);
    expect(h.t.balanceOf('b')).toBe(2000);
    expect(h.run({ type: 'setName', playerId: 'a', name: '   ' })).toMatchObject({ code: 'INVALID_NAME' });
    expect(h.run({ type: 'setName', playerId: '', name: 'x' })).toMatchObject({ code: 'INVALID_PLAYER' });
  });
});

describe('Repetir aposta e X2', () => {
  /** Rodada jogada: lugar 0 com principal 1000 + 23+1 250 + Pares 500 + Buster 250. */
  function played() {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    sit(h, 0, 50_000, { main: 1000, twentyThree: 250, pairs: 500, buster: 250 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand');
    return h;
  }
  it('só existe após uma rodada jogada, na fase de apostas e antes de confirmar', () => {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    seatPlayer(h, 0, 50_000);
    expect(h.run({ type: 'repeatBets', seat: 0, multiplier: 1 })).toMatchObject({ code: 'NO_PREVIOUS_BETS' });
    bet(h, 0, { main: 500 });
    h.ok({ type: 'confirmBets', seat: 0 });
    h.ok({ type: 'deal' });
    expect(h.run({ type: 'repeatBets', seat: 0, multiplier: 1 })).toMatchObject({ code: 'WRONG_PHASE' });
    act(h, 0, 'stand');
    expect(toView(h.t, 'P0').seats[0]!.canRepeat).toBe(false); // ainda em SETTLEMENT
    h.ok({ type: 'nextRound' });
    expect(toView(h.t, 'P0').seats[0]!.canRepeat).toBe(true);
  });
  it('Repetir repõe principal e as três side bets, debitando a carteira', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    const before = h.bal(0);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    expect(h.t.seats[0]!.bets).toEqual({ main: 1000, twentyThree: 250, pairs: 500, buster: 250 });
    expect(h.bal(0)).toBe(before - 2000);
  });
  it('X2 repõe o dobro', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    const before = h.bal(0);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 2 });
    expect(h.t.seats[0]!.bets).toEqual({ main: 2000, twentyThree: 500, pairs: 1000, buster: 500 });
    expect(h.bal(0)).toBe(before - 4000);
  });
  it('substitui (não soma) e cliques repetidos não duplicam débito; X2 depois de Repetir troca o valor', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    const before = h.bal(0);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    expect(h.bal(0)).toBe(before - 2000);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 2 });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 2 });
    expect(h.t.seats[0]!.bets.main).toBe(2000);
    expect(h.bal(0)).toBe(before - 4000);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 }); // volta ao valor simples e devolve a diferença
    expect(h.bal(0)).toBe(before - 2000);
  });
  it('mesmo id de comando: cache, sem novo débito', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    const before = h.bal(0);
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 2, id: 'r1' });
    expect(h.run({ type: 'repeatBets', seat: 0, multiplier: 2, id: 'r1' })).toMatchObject({ ok: true, duplicate: true });
    expect(h.bal(0)).toBe(before - 4000);
  });
  it('Double, Split e Insurance não alteram a configuração guardada', () => {
    // dealer A: insurance; jogador 8,8 → split e double
    const h = mkTable(['8S', 'AH', '8D', '6C', '3C', '2C', '10C']);
    sit(h, 0, 50_000, { main: 1000, twentyThree: 250 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: true });
    act(h, 0, 'split');
    act(h, 0, 'double');
    act(h, 0, 'stand');
    expect(h.t.seats[0]!.lastBets).toEqual({ main: 1000, twentyThree: 250, pairs: 0, buster: 0 });
    h.ok({ type: 'nextRound' });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    expect(h.t.seats[0]!.bets).toEqual({ main: 1000, twentyThree: 250, pairs: 0, buster: 0 });
  });
  it('saldo insuficiente no X2: mantém as apostas atuais, nada é aplicado pela metade', () => {
    const h = mkTable(['10S', '10D', '9H', '8C']);
    sit(h, 0, 3000, { main: 1000, twentyThree: 250, pairs: 250, buster: 250 }); // gasta 1750, sobram 1250
    h.ok({ type: 'deal' });
    act(h, 0, 'stand'); // 20 vs 18: retorno de 2000; side bets perdem
    expect(h.bal(0)).toBe(3250);
    h.ok({ type: 'nextRound' });
    bet(h, 0, { main: 500, pairs: 250 }); // carteira: 2500
    expect(h.bal(0)).toBe(2500);
    // X2 = 2000 + 500 + 500 + 500 = 3500; disponível (carteira + apostas atuais) = 3250
    const r = h.run({ type: 'repeatBets', seat: 0, multiplier: 2 });
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    if (!r.ok) expect(r.message).toMatch(/Saldo insuficiente para X2/);
    expect(h.t.seats[0]!.bets).toEqual({ main: 500, twentyThree: 0, pairs: 250, buster: 0 });
    expect(h.bal(0)).toBe(2500);
    // o Repetir simples (1750) cabe
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    expect(h.bal(0)).toBe(3250 - 1750);
  });
  it('carteira compartilhada: X2 no 2º lugar falha se o 1º já consumiu o saldo', () => {
    // lugar 1: 19 ganha; lugar 2: 15 perde (dealer 17)
    const h = mkTable(['10S', '10H', '10D', '9C', '5C', '7C']);
    join(h, 'ana', 2500);
    take(h, 'ana', 0); take(h, 'ana', 1);
    bet(h, 0, { main: 1000 }); bet(h, 1, { main: 1000 });
    h.ok({ type: 'confirmBets', seat: 0 }); h.ok({ type: 'confirmBets', seat: 1 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand'); act(h, 1, 'stand');
    expect(h.t.balanceOf('ana')).toBe(2500); // 500 + 2000 (lugar 1) + 0
    h.ok({ type: 'nextRound' });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 2 }); // consome 2000
    expect(h.t.balanceOf('ana')).toBe(500);
    const r = h.run({ type: 'repeatBets', seat: 1, multiplier: 2 }); // precisaria de 2000
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(h.t.seats[1]!.bets.main).toBe(0);
    expect(h.t.balanceOf('ana')).toBe(500);
  });
  it('jogador ainda pode editar, limpar e confirmar depois de Repetir; não após confirmar', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    h.ok({ type: 'repeatBets', seat: 0, multiplier: 1 });
    h.ok({ type: 'setBet', seat: 0, kind: 'buster', amount: 0 });
    h.ok({ type: 'setBet', seat: 0, kind: 'main', amount: 1200 });
    h.ok({ type: 'confirmBets', seat: 0 });
    expect(h.run({ type: 'repeatBets', seat: 0, multiplier: 1 })).toMatchObject({ code: 'BETS_LOCKED' });
    h.ok({ type: 'editBets', seat: 0 });
    h.ok({ type: 'clearBets', seat: 0 });
    expect(h.t.seats[0]!.bets.main).toBe(0);
    expect(h.t.seats[0]!.lastBets).toEqual({ main: 1000, twentyThree: 250, pairs: 500, buster: 250 });
  });
  it('lugar que sai perde a configuração; o próximo ocupante não herda', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    h.ok({ type: 'leave', seat: 0 });
    join(h, 'bia', 5000);
    take(h, 'bia', 0);
    expect(h.run({ type: 'repeatBets', playerId: 'bia', seat: 0, multiplier: 1 })).toMatchObject({ code: 'NO_PREVIOUS_BETS' });
  });
  it('multiplicador inválido é recusado', () => {
    const h = played();
    h.ok({ type: 'nextRound' });
    expect(h.run({ type: 'repeatBets', seat: 0, multiplier: 3 as any })).toMatchObject({ code: 'INVALID_MULTIPLIER' });
  });
});
