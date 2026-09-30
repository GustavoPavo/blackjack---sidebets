import { describe, it, expect } from 'vitest';
import { mkTable, sit } from './helpers';

const act = (h: ReturnType<typeof mkTable>, seat: number, action: any) => h.run({ type: 'action', seat, action });
const insurance = (h: ReturnType<typeof mkTable>, seat: number, take: boolean) => h.ok({ type: 'insurance', seat, take });

describe('Insurance: blackjack do dealer conferido ANTES dos turnos', () => {
  it('dealer A+Q, jogador 9+7, Insurance recusado: rodada termina, Hit é rejeitado, jogador fica com 2 cartas', () => {
    // ordem: 9 (lugar), A (dealer aberta), 7 (lugar), Q (dealer fechada), 5 (carta que um Hit indevido compraria)
    const h = mkTable(['9S', 'AD', '7H', 'QC', '5D']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.phase).toBe('INSURANCE');
    insurance(h, 0, false);
    expect(h.t.phase).toBe('SETTLEMENT');
    expect(h.t.dealer.holeHidden).toBe(false);
    expect(h.t.dealer.cards).toHaveLength(2);
    expect(act(h, 0, 'hit')).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(h.t.seats[0]!.hands[0]!.cards).toHaveLength(2);
    expect(h.t.seats[0]!.results.find((r) => r.kind === 'main')).toMatchObject({ outcome: 'lose', payout: 0 });
    expect(h.bal(0)).toBe(4000);
  });

  it('dois lugares: recusar no primeiro não libera ações enquanto o segundo decide; a última decisão encerra ambos', () => {
    const h = mkTable(['9S', '10H', 'AD', '7H', '8C', 'QC', '5D']);
    sit(h, 0, 5000, { main: 1000 });
    sit(h, 1, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    expect(h.t.phase).toBe('INSURANCE');
    insurance(h, 0, false);
    expect(h.t.phase).toBe('INSURANCE');
    expect(act(h, 0, 'hit')).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(act(h, 1, 'hit')).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(h.t.dealer.holeHidden).toBe(true);
    insurance(h, 1, true);
    expect(h.t.phase).toBe('SETTLEMENT');
    expect(h.t.seats[0]!.hands[0]!.cards).toHaveLength(2);
    expect(h.t.seats[1]!.hands[0]!.cards).toHaveLength(2);
    expect(h.bal(0)).toBe(4000);
    expect(h.bal(1)).toBe(5000); // principal perdida; insurance 500 paga 2:1 (devolve 1500)
  });

  it('ninguém aceita ou ninguém tem saldo: a verificação acontece mesmo assim', () => {
    const h = mkTable(['9S', 'AD', '7H', 'KC']);
    sit(h, 0, 1000, { main: 1000 }); // saldo zero: Insurance recusado automaticamente
    h.ok({ type: 'deal' });
    expect(h.t.seats[0]!.insuranceDecision).toBe('declined');
    expect(h.t.phase).toBe('SETTLEMENT');
    expect(act(h, 0, 'stand')).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
  });

  it('sem blackjack: Insurance perdido uma única vez, carta fechada oculta e turnos liberados', () => {
    const h = mkTable(['9S', 'AD', '7H', '6C', '2D']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    insurance(h, 0, true);
    expect(h.t.phase).toBe('PLAYER_TURNS');
    expect(h.t.dealer.holeHidden).toBe(true);
    expect(h.bal(0)).toBe(3500);
    const ins = () => h.t.seats[0]!.results.filter((r) => r.kind === 'insurance');
    expect(ins()).toHaveLength(1);
    expect(ins()[0]).toMatchObject({ outcome: 'lose', payout: 0 });
    expect(act(h, 0, 'stand')).toMatchObject({ ok: true });
    expect(ins()).toHaveLength(1); // não liquida de novo
    expect(h.t.phase).toBe('SETTLEMENT');
  });

  it('Insurance com blackjack é liquidado uma única vez', () => {
    const h = mkTable(['9S', 'AD', '7H', 'KC']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    insurance(h, 0, true);
    expect(h.t.seats[0]!.results.filter((r) => r.kind === 'insurance')).toHaveLength(1);
    expect(h.bal(0)).toBe(5000);
    expect(h.run({ type: 'nextRound' })).toMatchObject({ ok: true });
    expect(h.bal(0)).toBe(5000);
  });
});
