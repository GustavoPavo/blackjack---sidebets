import { describe, it, expect } from 'vitest';
import { mkTable, sit, seatPlayer, bet } from './helpers';
import { toView, seatNumber } from '../src';

const act = (h: ReturnType<typeof mkTable>, seat: number, action: any) => h.ok({ type: 'action', seat, action });

describe('ordem dos lugares, distribuição e turnos (lugar 1 → 5)', () => {
  // lugares 1, 3 e 4 (índices 0, 2, 3) com aposta; lugares 2 (índice 1) sentado sem aposta; 5 vazio
  function setup() {
    const h = mkTable(['2S', '3S', '4S', 'KD', '5H', '6H', '7H', 'QC', '9C', '9D', '9H']);
    sit(h, 0, 10_000, { main: 500 });
    seatPlayer(h, 1, 10_000); // sentado, sem aposta: ignorado
    sit(h, 2, 10_000, { main: 500 });
    sit(h, 3, 10_000, { main: 500 });
    h.ok({ type: 'deal' });
    return h;
  }
  it('1ª carta de cada lugar (1→5), 1ª do dealer, 2ª de cada lugar, carta fechada do dealer', () => {
    const h = setup();
    const rank = (seat: number, i: number) => h.t.seats[seat]!.hands[0]!.cards[i]!.rank;
    expect([rank(0, 0), rank(2, 0), rank(3, 0)]).toEqual(['2', '3', '4']);
    expect(h.t.dealer.cards[0]!.rank).toBe('K'); // aberta
    expect([rank(0, 1), rank(2, 1), rank(3, 1)]).toEqual(['5', '6', '7']);
    expect(h.t.dealer.cards[1]!.rank).toBe('Q'); // fechada
  });
  it('a ordem global de saque (seq) reflete a mesma sequência, para a animação', () => {
    const h = setup();
    const v = toView(h.t, 'P0');
    const drawn: { label: string; seq: number }[] = [];
    v.seats.forEach((s) => s.hands.forEach((hd) => hd.cardSeq.forEach((q, i) => drawn.push({ label: `L${s.number}c${i + 1}`, seq: q }))));
    v.dealer.cardSeq.forEach((q, i) => drawn.push({ label: `D${i + 1}`, seq: q }));
    drawn.sort((a, b) => a.seq - b.seq);
    expect(drawn.map((d) => d.label)).toEqual(['L1c1', 'L3c1', 'L4c1', 'D1', 'L1c2', 'L3c2', 'L4c2', 'D2']);
  });
  it('lugares sem aposta são ignorados na distribuição e nos turnos', () => {
    const h = setup();
    expect(h.t.seats[1]!.hands).toHaveLength(0);
    expect(h.t.seats[4]!.hands).toHaveLength(0);
    expect(toView(h.t).turn).toEqual({ seat: 0, hand: 0 });
  });
  it('turnos seguem 1 → 3 → 4 (crescente), cada lugar joga todas as suas mãos antes do próximo', () => {
    const h = setup();
    const order: number[] = [];
    let guard = 0;
    while (h.t.phase === 'PLAYER_TURNS' && guard++ < 20) {
      const turn = toView(h.t).turn!;
      order.push(seatNumber(turn.seat));
      act(h, turn.seat, 'stand');
    }
    expect(order).toEqual([1, 3, 4]);
  });
  it('um lugar fora de vez é recusado', () => {
    const h = setup();
    expect(h.run({ type: 'action', seat: 3, action: 'stand' })).toMatchObject({ code: 'NOT_YOUR_TURN' });
  });
  it('numeração: índice interno 0..4 ↔ lugar exibido 1..5', () => {
    expect([0, 1, 2, 3, 4].map(seatNumber)).toEqual([1, 2, 3, 4, 5]);
    const v = toView(mkTable([]).t);
    expect(v.seats.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
  });
  it('todas as cartas iniciais com 5 lugares: ordem 1..5 por rodada de cartas', () => {
    const h = mkTable(['2S', '3S', '4S', '5S', '6S', 'KD', '2H', '3H', '4H', '5H', '6H', 'QC', '9C', '9D', '9H']);
    for (let i = 0; i < 5; i++) { seatPlayer(h, i, 5000); bet(h, i, { main: 500 }); h.ok({ type: 'confirmBets', seat: i }); }
    h.ok({ type: 'deal' });
    expect(h.t.seats.map((s) => s.hands[0]!.cards[0]!.rank)).toEqual(['2', '3', '4', '5', '6']);
    expect(h.t.seats.map((s) => s.hands[0]!.cards[1]!.rank)).toEqual(['2', '3', '4', '5', '6']);
    expect(h.t.dealer.cards.map((c) => c.rank)).toEqual(['K', 'Q']);
  });
});
