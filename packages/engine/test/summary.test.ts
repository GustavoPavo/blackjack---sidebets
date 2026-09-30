import { describe, it, expect } from 'vitest';
import { mkTable, join, bet, sit, seatPlayer } from './helpers';
import { toView, roundMessage } from '../src';

const act = (h: ReturnType<typeof mkTable>, seat: number, action: any) => h.ok({ type: 'action', seat, action });
const take = (h: ReturnType<typeof mkTable>, playerId: string, seat: number) => h.ok({ type: 'takeSeat', playerId, seat });

describe('mensagem da rodada', () => {
  it('formatos: ganho, empate, perda', () => {
    expect(roundMessage(4000)).toEqual({ kind: 'win', text: 'Você ganhou R$ 40,00' });
    expect(roundMessage(0)).toEqual({ kind: 'tie', text: 'Rodada empatada' });
    expect(roundMessage(-1000)).toEqual({ kind: 'loss', text: 'Resultado da rodada: −R$ 10,00' });
    expect(roundMessage(1)).toMatchObject({ text: 'Você ganhou R$ 0,01' });
  });
});

describe('lucro líquido total da rodada', () => {
  it('exemplo: aposta de R$ 50 recebe R$ 100 (+50) e outra aposta perde R$ 10 → "Você ganhou R$ 40,00"', () => {
    // um jogador, lugares 1 e 2. Lugar 1: 20 vs dealer 18 (ganha). Lugar 2: 15 (perde).
    const h = mkTable(['10S', '10H', '10D', '10C', '5C', '8S']);
    join(h, 'ana', 20_000);
    take(h, 'ana', 0); take(h, 'ana', 1);
    bet(h, 0, { main: 5000 }); bet(h, 1, { main: 1000 });
    h.ok({ type: 'confirmBets', seat: 0 }); h.ok({ type: 'confirmBets', seat: 1 });
    h.ok({ type: 'deal' });
    act(h, 0, 'stand'); act(h, 1, 'stand');
    const s = toView(h.t, 'ana').roundSummary;
    expect(s).toHaveLength(1);
    expect(s[0]!.net).toBe(4000);
    expect(s[0]!.message.text).toBe('Você ganhou R$ 40,00');
    expect(s[0]!.seats.map((x) => [x.number, x.net])).toEqual([[1, 5000], [2, -1000]]);
    expect(h.t.balanceOf('ana')).toBe(20_000 + 4000);
  });

  it('inclui mão principal, mãos de split, side bets e insurance, e bate com a variação da carteira', () => {
    // seat1: 8♠ 8♦ (Red/Black Pair 6:1), dealer A♥ + 6♣ (soft 17), insurance perdido
    // split: mão 1 = 8♠+10♣ (18, ganha), mão 2 = 8♦+9♣ (17, empata)
    const h = mkTable(['8S', 'AH', '8D', '6C', '10C', '9C']);
    sit(h, 0, 10_000, { main: 1000, twentyThree: 250, pairs: 250, buster: 250 });
    const start = h.bal(0) + 1750;
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: true });
    act(h, 0, 'split');
    act(h, 0, 'stand'); act(h, 0, 'stand');
    const sum = toView(h.t, 'P0').roundSummary[0]!;
    const byKind = (k: string) => sum.seats[0]!.items.filter((i) => i.kind === k).map((i) => i.net);
    expect(byKind('main')).toEqual([1000, 0]); // mão 1 ganha, mão 2 empata
    expect(byKind('pairs')).toEqual([1500]); // 6:1 sobre 250
    expect(byKind('twentyThree')).toEqual([-250]);
    expect(byKind('buster')).toEqual([-250]);
    expect(byKind('insurance')).toEqual([-500]);
    expect(sum.net).toBe(1500);
    expect(sum.message.text).toBe('Você ganhou R$ 15,00');
    expect(h.bal(0) - start).toBe(1500); // devolução da aposta não conta como lucro
  });

  it('resultado zero → "Rodada empatada"; negativo → "Resultado da rodada: −R$ …"', () => {
    const tie = mkTable(['10S', '10D', '8H', '8C']);
    sit(tie, 0, 5000, { main: 500 });
    tie.ok({ type: 'deal' });
    act(tie, 0, 'stand');
    expect(toView(tie.t, 'P0').roundSummary[0]!.message.text).toBe('Rodada empatada');
    const loss = mkTable(['10S', '10D', '6H', '9C', '10H']);
    sit(loss, 0, 5000, { main: 1000 });
    loss.ok({ type: 'deal' });
    act(loss, 0, 'hit');
    expect(toView(loss.t, 'P0').roundSummary[0]!.message.text).toBe('Resultado da rodada: −R$ 10,00');
  });

  it('blackjack natural: +1,5× a aposta; surrender: −metade', () => {
    const bj = mkTable(['AS', '9D', 'KH', '8C']);
    sit(bj, 0, 5000, { main: 1000 });
    bj.ok({ type: 'deal' });
    expect(toView(bj.t, 'P0').roundSummary[0]!.net).toBe(1500);
    const sr = mkTable(['10S', '10D', '6H', '7C']);
    sit(sr, 0, 5000, { main: 1000 });
    sr.ok({ type: 'deal' });
    act(sr, 0, 'surrender');
    expect(toView(sr.t, 'P0').roundSummary[0]!.net).toBe(-500);
  });

  it('resumo separado por jogador; só aparece na liquidação e não inclui buy-in/rebuy', () => {
    const h = mkTable(['10S', '10H', '10D', '10C', '9C', '8S']);
    sit(h, 0, 5000, { main: 1000 });
    sit(h, 1, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(toView(h.t, 'P0').roundSummary).toEqual([]);
    act(h, 0, 'stand'); act(h, 1, 'stand');
    const s = toView(h.t, 'P0').roundSummary;
    expect(s.map((x) => [x.playerId, x.net])).toEqual([['P0', 1000], ['P1', 1000]]);
    expect(h.t.players.get('P0')!.ledger).toHaveLength(1); // buy-in não entra no lucro
    seatPlayer; // (importado para outros testes)
  });
});
