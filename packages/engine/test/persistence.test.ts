import { describe, it, expect } from 'vitest';
import { Table, Shoe, toView, type Action, type Command } from '../src';
import { mkTable, sit, seatPlayer, bet, join } from './helpers';

function lcg(seed: number) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const total = (t: Table) => [...t.players.values()].reduce((a, p) => a + p.balance, 0);
const inPlay = (t: Table) => t.seats.reduce((a, s) => {
  let n = s.bets.twentyThree + s.bets.pairs + s.bets.buster + s.bets.main * (s.hands.length ? 0 : 1) + (s.insuranceSettled ? 0 : s.insurance);
  for (const h of s.hands) n += h.bet; // principal em jogo (inclui Double/Split)
  return a + n;
}, 0);

describe('snapshot / restore', () => {
  it('restaura o mesmo estado (fase, apostas, mãos, shoe) e continua igual ao original', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rnd = lcg(seed);
      const a = new Table({ rng: rnd });
      let n = 0;
      const run = (t: Table, cmd: any) => t.dispatch({ id: `s${seed}-${++n}`, ...cmd } as Command);
      for (let i = 0; i < 5; i++) { run(a, { type: 'setName', playerId: `P${i}`, name: `J${i}` }); run(a, { type: 'buyIn', playerId: `P${i}`, amount: 100_000 }); run(a, { type: 'takeSeat', playerId: `P${i}`, seat: i }); }
      for (let round = 0; round < 4; round++) {
        for (let i = 0; i < 5; i++) {
          run(a, { type: 'setBet', playerId: `P${i}`, seat: i, kind: 'main', amount: 500 + 2 * Math.floor(rnd() * 300) });
          if (rnd() < 0.5) run(a, { type: 'setBet', playerId: `P${i}`, seat: i, kind: 'buster', amount: 250 });
          run(a, { type: 'confirmBets', playerId: `P${i}`, seat: i });
        }
        run(a, { type: 'deal', playerId: 'P0' });
        let guard = 0;
        while (a.phase !== 'SETTLEMENT' && guard++ < 200) {
          // clona no meio da rodada (inclusive na oferta de Insurance e entre mãos de split)
          const clone = new Table({ rng: rnd });
          for (const [id, p] of a.players) clone.players.set(id, JSON.parse(JSON.stringify(p)));
          clone.restore(JSON.parse(JSON.stringify(a.snapshot())));
          expect(toView(clone, 'P0')).toEqual(toView(a, 'P0'));
          if (a.phase === 'INSURANCE') {
            for (const s of a.seats) if (s.insuranceDecision === 'pending') {
              const take = rnd() < 0.5;
              const cmd = { type: 'insurance', playerId: s.playerId, seat: s.index, take };
              const id = `z${seed}-${++n}`;
              a.dispatch({ id, ...cmd } as Command); clone.dispatch({ id, ...cmd } as Command);
            }
          } else {
            const legal = a.legalActions();
            const turn = toView(a).turn!;
            const action = legal[Math.floor(rnd() * legal.length)] as Action;
            const id = `z${seed}-${++n}`;
            const cmd = { id, type: 'action', playerId: a.seats[turn.seat]!.playerId, seat: turn.seat, action } as Command;
            expect(a.dispatch(cmd)).toEqual(clone.dispatch(cmd)); // mesmas cartas, mesmos pagamentos
            expect(toView(clone, 'P0')).toEqual(toView(a, 'P0'));
            for (const [id2, p] of a.players) expect(clone.players.get(id2)!.balance).toBe(p.balance);
          }
        }
        run(a, { type: 'nextRound', playerId: 'P0' });
      }
    }
  });

  it('recusa snapshot inválido sem alterar a mesa', () => {
    const h = mkTable([]);
    const snap = h.t.snapshot();
    const t2 = new Table();
    expect(() => t2.restore({ ...snap, version: 99 })).toThrow(/versão/);
    expect(() => t2.restore({ ...snap, seats: snap.seats.slice(0, 3) })).toThrow(/lugares/);
    const orphan = JSON.parse(JSON.stringify(snap));
    orphan.seats[0].playerId = 'fantasma';
    expect(() => t2.restore(orphan)).toThrow(/inexistente/);
    expect(t2.phase).toBe('BETTING');
  });

  it('o snapshot contém o shoe restante mas a visão pública não', () => {
    const h = mkTable(['10S', '10D', '9H', '8C', '2C']);
    sit(h, 0, 5000, { main: 500 });
    h.ok({ type: 'deal' });
    expect(h.t.snapshot().shoe).toHaveLength(1);
    expect(JSON.stringify(toView(h.t, 'P0'))).not.toContain('"shoe"');
  });
});

describe('abortRound: devolve exatamente o que não foi liquidado', () => {
  it('em jogo: devolve principal (com Double/Split), Insurance e Buster; mantém o que já foi liquidado', () => {
    // 8,8 vs A: insurance; 23+1/pairs liquidam no deal; split + double
    const h = mkTable(['8S', 'AH', '8D', '6C', '3C', '2C', '10C']);
    sit(h, 0, 50_000, { main: 1000, twentyThree: 250, pairs: 250, buster: 500 });
    const t0 = total(h.t) + inPlay(h.t); // créditos totais antes do deal
    h.ok({ type: 'deal' });
    h.ok({ type: 'insurance', seat: 0, take: true });
    h.ok({ type: 'action', seat: 0, action: 'split' });
    h.ok({ type: 'action', seat: 0, action: 'double' });
    expect(h.t.phase).toBe('PLAYER_TURNS');
    const settledNet = h.t.seats[0]!.results.reduce((a, r) => a + r.net, 0); // 23+1 perdeu, Pares ganhou
    const refunded = h.t.abortRound();
    expect(h.t.phase).toBe('BETTING');
    expect(h.t.seats[0]!.hands).toHaveLength(0);
    // principal: mão 1 dobrada (2000) + mão 2 (1000) ; buster 500. Insurance já foi liquidado (perdido) e não volta.
    expect(refunded).toBe(2000 + 1000 + 500);
    expect(total(h.t)).toBe(t0 + settledNet);
  });

  it('desistência já liquidada não é devolvida de novo', () => {
    const h = mkTable(['10S', '10D', '6H', '7C']);
    sit(h, 0, 5000, { main: 1000 });
    h.ok({ type: 'deal' });
    h.ok({ type: 'action', seat: 0, action: 'surrender' });
    expect(h.t.phase).toBe('SETTLEMENT');
    expect(h.t.abortRound()).toBe(0);
    expect(h.bal(0)).toBe(4500);
  });

  it('na fase de apostas devolve tudo', () => {
    const h = mkTable([]);
    sit(h, 0, 5000, { main: 1000, pairs: 250 });
    expect(h.bal(0)).toBe(3750);
    expect(h.t.abortRound()).toBe(1250);
    expect(h.bal(0)).toBe(5000);
    expect(h.t.seats[0]!.confirmed).toBe(false);
  });

  it('fuzz: cancelar em qualquer ponto conserva os créditos', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = lcg(seed);
      const t = new Table({ rng: rnd });
      let n = 0;
      const run = (cmd: any) => t.dispatch({ id: `a${seed}-${++n}`, ...cmd } as Command);
      for (let i = 0; i < 3; i++) { run({ type: 'setName', playerId: `P${i}`, name: 'x' }); run({ type: 'buyIn', playerId: `P${i}`, amount: 100_000 }); run({ type: 'takeSeat', playerId: `P${i}`, seat: i }); }
      for (let i = 0; i < 3; i++) {
        run({ type: 'setBet', playerId: `P${i}`, seat: i, kind: 'main', amount: 1000 });
        run({ type: 'setBet', playerId: `P${i}`, seat: i, kind: 'twentyThree', amount: 250 });
        run({ type: 'setBet', playerId: `P${i}`, seat: i, kind: 'buster', amount: 250 });
        run({ type: 'confirmBets', playerId: `P${i}`, seat: i });
      }
      const t0 = total(t) + inPlay(t);
      run({ type: 'deal', playerId: 'P0' });
      let steps = Math.floor(rnd() * 6);
      while (steps-- > 0 && (t.phase === 'INSURANCE' || t.phase === 'PLAYER_TURNS')) {
        if (t.phase === 'INSURANCE') {
          for (const s of t.seats) if (s.insuranceDecision === 'pending') run({ type: 'insurance', playerId: s.playerId, seat: s.index, take: rnd() < 0.5 });
        } else {
          const legal = t.legalActions(); const turn = toView(t).turn!;
          run({ type: 'action', playerId: t.seats[turn.seat]!.playerId, seat: turn.seat, action: legal[Math.floor(rnd() * legal.length)] });
        }
      }
      if (t.phase === 'SETTLEMENT') continue;
      const settledNet = t.seats.reduce((a, s) => a + s.results.reduce((b, r) => b + r.net, 0), 0);
      t.abortRound();
      expect(total(t)).toBe(t0 + settledNet);
      expect(t.phase).toBe('BETTING');
    }
  });
});
