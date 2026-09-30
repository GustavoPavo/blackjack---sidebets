import { describe, it, expect } from 'vitest';
import { Table, toView, type Action } from '../src';

function lcg(seed: number) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }

/** Joga rodadas com jogadas legais aleatórias. `single`: UM jogador ocupa os 5 lugares (carteira única). */
function play(seed: number, single: boolean) {
  const rnd = lcg(seed);
  const t = new Table({ rng: rnd });
  let n = 0;
  const run = (cmd: any) => t.dispatch({ id: `f${seed}-${++n}`, ...cmd });
  const owner = (i: number) => (single ? 'P0' : `P${i}`);
  const ids = single ? ['P0'] : ['P0', 'P1', 'P2', 'P3', 'P4'];
  for (const p of ids) { run({ type: 'setName', playerId: p, name: p }); run({ type: 'buyIn', playerId: p, amount: 100_000 }); }
  for (let i = 0; i < 5; i++) run({ type: 'takeSeat', playerId: owner(i), seat: i });
  for (let round = 0; round < 12; round++) {
    for (const p of ids) if (t.balanceOf(p) < 20_000) run({ type: 'rebuy', playerId: p, amount: 100_000 });
    for (let i = 0; i < 5; i++) {
      const pl = owner(i);
      run({ type: 'setBet', playerId: pl, seat: i, kind: 'main', amount: 500 + 2 * Math.floor(rnd() * 500) });
      if (rnd() < 0.7) run({ type: 'setBet', playerId: pl, seat: i, kind: 'twentyThree', amount: 250 });
      if (rnd() < 0.7) run({ type: 'setBet', playerId: pl, seat: i, kind: 'pairs', amount: 250 });
      if (rnd() < 0.7) run({ type: 'setBet', playerId: pl, seat: i, kind: 'buster', amount: 250 });
      if (round > 0 && rnd() < 0.3) run({ type: 'repeatBets', playerId: pl, seat: i, multiplier: rnd() < 0.5 ? 1 : 2 });
      run({ type: 'confirmBets', playerId: pl, seat: i });
    }
    expect(run({ type: 'deal', playerId: ids[0] }).ok).toBe(true);
    let guard = 0;
    while (t.phase !== 'SETTLEMENT' && guard++ < 500) {
      if (t.phase === 'INSURANCE') {
        for (const s of t.seats) if (s.insuranceDecision === 'pending') run({ type: 'insurance', playerId: s.playerId, seat: s.index, take: rnd() < 0.5 });
      } else {
        const legal = t.legalActions();
        const turn = toView(t).turn!;
        const a = legal[Math.floor(rnd() * legal.length)] as Action;
        expect(run({ type: 'action', playerId: t.seats[turn.seat]!.playerId, seat: turn.seat, action: a }).ok).toBe(true);
      }
    }
    expect(t.phase).toBe('SETTLEMENT');
    for (const p of t.players.values()) {
      expect(Number.isInteger(p.balance)).toBe(true);
      expect(p.balance).toBeGreaterThanOrEqual(0);
    }
    for (const s of t.seats) {
      expect(s.splits).toBeLessThanOrEqual(3);
      expect(s.hands.length).toBeLessThanOrEqual(4);
      for (const r of s.results) expect(Number.isInteger(r.payout)).toBe(true);
    }
    run({ type: 'nextRound', playerId: ids[0] });
  }
}

describe('fuzz: jogadas legais aleatórias', () => {
  it('um jogador por lugar: saldos inteiros e não negativos', () => {
    for (let seed = 1; seed <= 40; seed++) play(seed, false);
  });
  it('um único jogador nos 5 lugares (carteira compartilhada): saldo nunca negativo', () => {
    for (let seed = 100; seed <= 140; seed++) play(seed, true);
  });
});
