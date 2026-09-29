import { describe, it, expect } from 'vitest';
import { Table, toView, type Action } from '../src';

function lcg(seed: number) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }

describe('fuzz: jogadas legais aleatórias', () => {
  it('saldos sempre inteiros e não negativos; dinheiro não é criado fora das regras', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = lcg(seed);
      const t = new Table({ rng: rnd });
      let n = 0;
      const run = (cmd: any) => t.dispatch({ id: `f${seed}-${++n}`, ...cmd });
      for (let i = 0; i < 5; i++) run({ type: 'buyIn', seat: i, amount: 100_000 });
      for (let round = 0; round < 12; round++) {
        for (let i = 0; i < 5; i++) {
          const s = t.seats[i]!;
          if (s.balance < 500) { run({ type: 'rebuy', seat: i, amount: 100_000 }); }
          run({ type: 'setBet', seat: i, kind: 'main', amount: 500 + 2 * Math.floor(rnd() * 500) });
          if (rnd() < 0.7) run({ type: 'setBet', seat: i, kind: 'twentyThree', amount: 250 });
          if (rnd() < 0.7) run({ type: 'setBet', seat: i, kind: 'pairs', amount: 250 });
          if (rnd() < 0.7) run({ type: 'setBet', seat: i, kind: 'buster', amount: 250 });
          run({ type: 'confirmBets', seat: i });
        }
        expect(run({ type: 'deal' }).ok).toBe(true);
        let guard = 0;
        while (t.phase !== 'SETTLEMENT' && guard++ < 500) {
          if (t.phase === 'INSURANCE') {
            for (const s of t.seats) if (s.insuranceDecision === 'pending') run({ type: 'insurance', seat: s.index, take: rnd() < 0.5 });
          } else {
            const legal = t.legalActions();
            const turn = toView(t).turn!;
            const a = legal[Math.floor(rnd() * legal.length)] as Action;
            expect(run({ type: 'action', seat: turn.seat, action: a }).ok).toBe(true);
          }
        }
        expect(t.phase).toBe('SETTLEMENT');
        for (const s of t.seats) {
          expect(Number.isInteger(s.balance)).toBe(true);
          expect(s.balance).toBeGreaterThanOrEqual(0);
          expect(s.splits).toBeLessThanOrEqual(3);
          expect(s.hands.length).toBeLessThanOrEqual(4);
          for (const r of s.results) expect(Number.isInteger(r.payout)).toBe(true);
        }
        run({ type: 'nextRound' });
      }
    }
  });
});
