import { describe, it, expect } from 'vitest';
import {
  Table, dealerDistribution, recommend, recommendInsurance, INSURANCE_EV, STRATEGY_MARGIN, toView, cardValue,
  type Action, type Card, type Command, type Rank,
} from '../src';

const card = (rank: string): Card => ({ rank: rank as Rank, suit: 'S' });
const ALL: Action[] = ['hit', 'stand', 'double', 'surrender'];
const rec = (cards: string[], up: string, legal: Action[] = ALL, splitsLeft = 3) =>
  recommend({ cards: cards.map(card), dealerUp: card(up), legal, splitsLeft });

function lcg(seed: number) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
/** Carta aleatória de baralho infinito (valor 2..11). */
const draw = (r: () => number) => { const k = Math.floor(r() * 13); return k < 8 ? k + 2 : k < 12 ? 10 : 11; };

describe('distribuição do dealer (baralho infinito, para no soft 17)', () => {
  it('soma 1 e bate com valores de referência conhecidos', () => {
    for (let up = 2; up <= 11; up++) {
      const d = dealerDistribution(up);
      expect(d[17] + d[18] + d[19] + d[20] + d[21] + d.bust + d.blackjack).toBeCloseTo(1, 10);
    }
    const bust = (u: number) => dealerDistribution(u).bust;
    expect(bust(2)).toBeCloseTo(0.3536, 3);
    expect(bust(6)).toBeCloseTo(0.4232, 3);
    expect(bust(7)).toBeCloseTo(0.2623, 3);
    expect(bust(10)).toBeCloseTo(0.2121, 3);
    expect(bust(11)).toBeCloseTo(0.1153, 3);
  });
  it('blackjack do dealer: 4/13 com Ás, 1/13 com 10; impossível nas demais', () => {
    expect(dealerDistribution(11).blackjack).toBeCloseTo(4 / 13, 10);
    expect(dealerDistribution(10).blackjack).toBeCloseTo(1 / 13, 10);
    for (const u of [2, 3, 4, 5, 6, 7, 8, 9]) expect(dealerDistribution(u).blackjack).toBe(0);
  });
  it('confere com uma simulação independente (regras: compra abaixo de 17, para em qualquer 17)', () => {
    const r = lcg(12345);
    for (const up of [6, 10, 11]) {
      const N = 200_000;
      const count = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 };
      for (let i = 0; i < N; i++) {
        let total = up; let aces = up === 11 ? 1 : 0; let n = 1;
        const add = (v: number) => { total += v; if (v === 11) aces++; n++; while (total > 21 && aces > 0) { total -= 10; aces--; } };
        add(draw(r));
        if (total === 21 && n === 2) { count.blackjack++; continue; }
        while (total < 17) add(draw(r));
        if (total > 21) count.bust++; else (count as any)[total]++;
      }
      const d = dealerDistribution(up);
      for (const k of ['17', '18', '19', '20', '21', 'bust', 'blackjack'] as const) expect(Math.abs((count as any)[k] / N - (d as any)[k])).toBeLessThan(0.006);
    }
  });
  it('EV de parar e de dobrar confere com a simulação (incluindo a perda contra blackjack do dealer)', () => {
    const r = lcg(777);
    const N = 200_000;
    function dealerFinal(up: number): { total: number; bj: boolean } {
      let total = up; let aces = up === 11 ? 1 : 0; let n = 1;
      const add = (v: number) => { total += v; if (v === 11) aces++; n++; while (total > 21 && aces > 0) { total -= 10; aces--; } };
      add(draw(r));
      if (total === 21 && n === 2) return { total, bj: true };
      while (total < 17) add(draw(r));
      return { total, bj: false };
    }
    const vs = (player: number, f: { total: number; bj: boolean }) => (f.bj ? -1 : f.total > 21 ? 1 : player > f.total ? 1 : player === f.total ? 0 : -1);
    for (const [player, up] of [[20, 6], [18, 10], [17, 11], [19, 9]] as const) {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += vs(player, dealerFinal(up));
      const ev = rec([String(player - 10), '10'].map((x) => (x === '1' ? 'A' : x)), String(up === 11 ? 'A' : up), ['stand', 'hit']).evs.stand!;
      expect(Math.abs(sum / N - ev)).toBeLessThan(0.012);
    }
    // dobrar 11 contra 6 e contra 9: 2 × (uma carta, depois parar)
    for (const up of [6, 9]) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const c = draw(r); let t = 11 + (c === 11 ? 1 : c);
        sum += 2 * (t > 21 ? -1 : vs(t, dealerFinal(up)));
      }
      const ev = rec(['6', '5'], String(up), ALL).evs.double!;
      expect(Math.abs(sum / N - ev)).toBeLessThan(0.03);
    }
  });
});

describe('decisões conhecidas nas regras desta mesa', () => {
  const act = (cards: string[], up: string, legal?: Action[]) => rec(cards, up, legal).action;
  it('parar com mãos fortes', () => {
    expect(act(['10', '7'], '10')).toBe('stand');
    expect(act(['10', '9'], 'A')).toBe('stand');
    expect(act(['10', '8'], 'A')).toBe('stand');
    expect(act(['10', '3'], '2')).toBe('stand');
    expect(act(['10', '4'], '6')).toBe('stand');
    expect(act(['A', '8'], '6')).toBe('stand');
  });
  it('pedir carta', () => {
    expect(act(['10', '6'], '7')).toBe('hit');
    expect(act(['10', '2'], '3')).toBe('hit');
    expect(act(['A', '7'], '9')).toBe('hit');
    expect(act(['8', '3'], '6', ['hit', 'stand'])).toBe('hit');
  });
  it('dobrar', () => {
    expect(act(['6', '5'], '6')).toBe('double');
    expect(act(['6', '5'], '9')).toBe('double');
    expect(act(['5', '5'], '6', [...ALL, 'split'])).toBe('double');
    expect(act(['A', '7'], '3')).toBe('double');
    expect(act(['A', '6'], '4')).toBe('double');
  });
  it('dividir e não dividir', () => {
    expect(act(['8', '8'], '6', [...ALL, 'split'])).toBe('split');
    expect(act(['A', 'A'], '6', [...ALL, 'split'])).toBe('split');
    expect(act(['9', '9'], '6', [...ALL, 'split'])).toBe('split');
    expect(act(['7', '7'], '7', [...ALL, 'split'])).toBe('split');
    expect(act(['2', '2'], '7', [...ALL, 'split'])).toBe('split');
    expect(act(['9', '9'], '7', [...ALL, 'split'])).toBe('stand');
    expect(act(['10', '10'], '6', [...ALL, 'split'])).toBe('stand');
    expect(act(['5', '5'], '6', [...ALL, 'split'])).not.toBe('split');
  });
  it('mesa SEM peek: não dobra 11 contra 10 nem Ás; Ás-Ás contra Ás não divide', () => {
    expect(act(['6', '5'], 'A')).toBe('hit');
    expect(act(['6', '5'], '10')).toBe('hit');
    expect(act(['A', 'A'], 'A', [...ALL, 'split'])).not.toBe('split');
  });
  it('Surrender antecipado (primeira decisão) quando o EV é pior que perder metade', () => {
    expect(act(['10', '6'], '10')).toBe('surrender');
    expect(act(['10', '5'], '10')).toBe('surrender');
    expect(act(['10', '6'], 'A')).toBe('surrender');
    expect(act(['10', '7'], 'A')).toBe('surrender');
    // sem Surrender disponível (ex.: depois de pedir carta) a mesma mão vira decisão apertada
    expect(act(['10', '6'], '10', ['hit', 'stand'])).toBeNull();
  });
});

describe('quando NÃO há recomendação segura', () => {
  it('decisões apertadas (diferença de EV abaixo da margem) não recebem recomendação', () => {
    for (const [cards, up] of [[['10', '2'], '4'], [['A', '7'], '2'], [['9', '3'], '4'], [['10', '6'], '9']] as const) {
      const r = rec([...cards], up);
      expect(r.action).toBeNull();
      expect(r.explanation).toMatch(/Sem recomendação segura/);
      const evs = Object.values(r.evs).sort((a, b) => b - a);
      expect(evs[0]! - evs[1]!).toBeLessThan(STRATEGY_MARGIN);
    }
  });
  it('mãos com 3+ cartas usam uma margem maior (dependem da composição)', () => {
    // 3 cartas: 10 + 3 + 3 = 16 contra 10, só hit/stand: decisão apertada
    expect(recommend({ cards: ['10', '3', '3'].map(card), dealerUp: card('10'), legal: ['hit', 'stand'], splitsLeft: 0 }).action).toBeNull();
  });
  it('sem ações, sem cartas, mão estourada: mensagem explícita', () => {
    expect(rec(['10', '6'], '10', []).explanation).toMatch(/Sem recomendação disponível/);
    expect(recommend({ cards: [], dealerUp: card('6'), legal: ['hit'], splitsLeft: 0 }).action).toBeNull();
    expect(recommend({ cards: ['10', '9', '5'].map(card), dealerUp: card('6'), legal: ['hit', 'stand'], splitsLeft: 0 }).action).toBeNull();
  });
  it('ação única é marcada como forçada', () => {
    const r = rec(['A', 'A'], '6', ['stand']);
    expect(r).toMatchObject({ action: 'stand', forced: true });
  });
  it('split sem splits restantes não é avaliado', () => {
    const r = rec(['8', '8'], '6', [...ALL, 'split'], 0);
    expect(r.evs.split).toBeUndefined();
    expect(r.action).not.toBe('split');
  });
});

describe('propriedades', () => {
  it('determinística e sempre dentro das ações legais', () => {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
    for (const a of ranks) for (const b of ranks) for (const up of ranks) {
      const legal: Action[] = a === b ? [...ALL, 'split'] : ALL;
      const x = rec([a, b], up, legal);
      const y = rec([a, b], up, legal);
      expect(x).toEqual(y);
      if (x.action) expect(legal).toContain(x.action);
    }
  });
  it('EV de parar cresce com o total (17 → 21) contra qualquer carta do dealer', () => {
    for (const up of ['2', '6', '10', 'A']) {
      const ev = (t: number) => rec(t === 21 ? ['10', 'A'] : [String(t - 10), '10'], up, ['stand', 'hit']).evs.stand!;
      for (let t = 17; t < 21; t++) expect(ev(t + 1)).toBeGreaterThan(ev(t));
    }
  });
  it('Surrender vale −0,5 e Double é 2× o valor de uma carta', () => {
    const r = rec(['6', '5'], '6');
    expect(r.evs.surrender).toBe(-0.5);
    expect(r.evs.double).toBeGreaterThan(r.evs.hit!);
  });
  it('Insurance: sempre recusar (EV = −1/13 por unidade)', () => {
    const i = recommendInsurance();
    expect(i.action).toBe('decline');
    expect(i.ev).toBeCloseTo(-1 / 13, 10);
    expect(INSURANCE_EV).toBeCloseTo(-0.0769, 4);
    expect(i.explanation).toMatch(/Recusar/);
  });
});

describe('integração com o motor: a recomendação respeita as ações legais da mesa', () => {
  it('em partidas aleatórias, toda recomendação pertence ao conjunto legal do motor', () => {
    let checked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const rnd = lcg(seed);
      const t = new Table({ rng: rnd });
      let n = 0;
      const run = (cmd: any) => t.dispatch({ id: `g${seed}-${++n}`, ...cmd } as Command);
      for (let i = 0; i < 3; i++) { run({ type: 'setName', playerId: `P${i}`, name: 'x' }); run({ type: 'buyIn', playerId: `P${i}`, amount: 100_000 }); run({ type: 'takeSeat', playerId: `P${i}`, seat: i }); }
      for (let round = 0; round < 6; round++) {
        for (let i = 0; i < 3; i++) { run({ type: 'setBet', playerId: `P${i}`, seat: i, kind: 'main', amount: 1000 }); run({ type: 'confirmBets', playerId: `P${i}`, seat: i }); }
        run({ type: 'deal', playerId: 'P0' });
        let guard = 0;
        while (t.phase !== 'SETTLEMENT' && guard++ < 200) {
          if (t.phase === 'INSURANCE') { for (const s of t.seats) if (s.insuranceDecision === 'pending') run({ type: 'insurance', playerId: s.playerId, seat: s.index, take: false }); continue; }
          const v = toView(t, 'P0', { hints: true });
          expect(v.hint).not.toBeNull();
          if (v.hint!.action) expect(v.legalActions).toContain(v.hint!.action);
          checked++;
          const turn = v.turn!;
          const a = v.hint!.action ?? v.legalActions[0]!;
          run({ type: 'action', playerId: t.seats[turn.seat]!.playerId, seat: turn.seat, action: a });
        }
        run({ type: 'nextRound', playerId: 'P0' });
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(cardValue({ rank: 'K', suit: 'S' })).toBe(10);
  });
});
