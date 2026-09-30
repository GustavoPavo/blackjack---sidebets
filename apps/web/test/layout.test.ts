import { describe, it, expect } from 'vitest';
import type { TableView } from '@bj/engine';
import { Table, toView, Shoe } from '@bj/engine';
import { SEAT_VISUAL_ORDER, visualColumn } from '../src/layout';
import { planReveal, maxSeq } from '../src/reveal';

describe('ordem visual dos lugares', () => {
  it('da esquerda para a direita: 5, 4, 3, 2, 1', () => {
    expect(SEAT_VISUAL_ORDER).toEqual([5, 4, 3, 2, 1]);
  });
  it('lugar 1 (índice 0) na coluna da direita e lugar 5 (índice 4) na da esquerda', () => {
    expect(visualColumn(0)).toBe(5);
    expect(visualColumn(4)).toBe(1);
    expect([0, 1, 2, 3, 4].map(visualColumn)).toEqual([5, 4, 3, 2, 1]);
  });
});

function viewAfterDeal(seq: string[], seats: number[]): TableView {
  const card = (code: string) => ({ rank: code.slice(0, -1) as any, suit: code.slice(-1) as any });
  const t = new Table({ shoeFactory: () => Shoe.stacked(seq.map(card)), reshuffleBelow: 0 });
  let n = 0;
  const d = (c: any) => t.dispatch({ id: `i${++n}`, ...c });
  for (const s of seats) {
    d({ type: 'setName', playerId: `P${s}`, name: `J${s}` });
    d({ type: 'buyIn', playerId: `P${s}`, amount: 10_000 });
    d({ type: 'takeSeat', playerId: `P${s}`, seat: s });
    d({ type: 'setBet', playerId: `P${s}`, seat: s, kind: 'main', amount: 500 });
    d({ type: 'confirmBets', playerId: `P${s}`, seat: s });
  }
  d({ type: 'deal', playerId: `P${seats[0]}` });
  return toView(t, `P${seats[0]}`);
}

describe('planejamento da animação (carta por carta)', () => {
  it('distribuição: 1ª carta de cada lugar (1→5), dealer, 2ª de cada lugar, dealer — sem lugares vazios', () => {
    const v = viewAfterDeal(['2S', '3S', '4S', 'KD', '5H', '6H', '7H', 'QC', '9C'], [0, 2, 3]);
    const steps = planReveal(v, { shownSeq: 0, holeUp: false });
    expect(steps.every((s) => s.type === 'card')).toBe(true);
    const order = steps.map((s) => (s as any).seq);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(steps).toHaveLength(8); // 3 lugares × 2 + dealer × 2
    // mapeia seq → rótulo
    const label = new Map<number, string>();
    v.seats.forEach((s) => s.hands.forEach((h) => h.cardSeq.forEach((q, i) => label.set(q, `L${s.number}c${i + 1}`))));
    v.dealer.cardSeq.forEach((q, i) => label.set(q, `D${i + 1}`));
    expect(order.map((q) => label.get(q))).toEqual(['L1c1', 'L3c1', 'L4c1', 'D1', 'L1c2', 'L3c2', 'L4c2', 'D2']);
  });
  it('nada a animar quando o estado já foi mostrado', () => {
    const v = viewAfterDeal(['10S', '9D', '8H', '7C'], [0]);
    expect(planReveal(v, { shownSeq: maxSeq(v), holeUp: false })).toEqual([]);
  });
  it('fim da rodada: carta fechada vira antes das compras do dealer, depois das cartas dos jogadores', () => {
    // dealer 6 + 5 = 11 → compra 2, 3, 4...; jogador para
    const card = (code: string) => ({ rank: code.slice(0, -1) as any, suit: code.slice(-1) as any });
    const seq = ['10S', '6D', '10H', '5C', '2D', '3C', '9H'];
    const t = new Table({ shoeFactory: () => Shoe.stacked(seq.map(card)), reshuffleBelow: 0 });
    let n = 0;
    const d = (c: any) => t.dispatch({ id: `j${++n}`, ...c });
    d({ type: 'setName', playerId: 'A', name: 'A' }); d({ type: 'buyIn', playerId: 'A', amount: 10_000 });
    d({ type: 'takeSeat', playerId: 'A', seat: 0 });
    d({ type: 'setBet', playerId: 'A', seat: 0, kind: 'main', amount: 500 }); d({ type: 'confirmBets', playerId: 'A', seat: 0 });
    d({ type: 'deal', playerId: 'A' });
    const before = toView(t, 'A');
    const shown = { shownSeq: maxSeq(before), holeUp: false };
    d({ type: 'action', playerId: 'A', seat: 0, action: 'stand' });
    const after = toView(t, 'A');
    const steps = planReveal(after, shown);
    expect(steps[0]).toEqual({ type: 'flip' });
    expect(steps.slice(1).every((s) => s.type === 'card')).toBe(true);
    expect(steps.length).toBeGreaterThan(1);
  });
});
