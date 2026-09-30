import { cardValue, type Card } from './cards';
import type { Action } from './types';
import { RULES } from './types';

/**
 * Estratégia básica por VALOR ESPERADO (EV), calculada de forma determinística para as regras desta mesa:
 *  - dealer para no soft 17; blackjack do dealer vence qualquer mão que não seja blackjack natural;
 *  - mesa SEM peek: Double e Split perdem tudo contra blackjack do dealer (já contado no EV);
 *  - Double em qualquer duas cartas, inclusive após split (exceto mãos de ases divididos);
 *  - Split até 3 vezes (4 mãos), com re-split de ases (cada mão de ases recebe uma só carta);
 *  - Surrender antecipado (early): só como primeira decisão da mão original, perde metade.
 *
 * APROXIMAÇÃO: baralho infinito (cada carta tem a mesma probabilidade a cada saque). O shoe real tem 6 baralhos,
 * cujo efeito de composição é pequeno; por isso decisões com diferença de EV abaixo de uma margem de segurança
 * NÃO recebem recomendação. Isto é uma estimativa, não garante lucro (o jogo tem vantagem da casa).
 */

/** (valor da carta, probabilidade): 2..9 → 1/13, 10/J/Q/K → 4/13, Ás (11) → 1/13. */
const DRAWS: readonly (readonly [number, number])[] = [
  [2, 1 / 13], [3, 1 / 13], [4, 1 / 13], [5, 1 / 13], [6, 1 / 13], [7, 1 / 13], [8, 1 / 13], [9, 1 / 13], [10, 4 / 13], [11, 1 / 13],
];

/** Diferença mínima de EV para recomendar. Mãos com 3+ cartas usam margem maior (dependem mais da composição). */
export const STRATEGY_MARGIN = 0.01;
export const STRATEGY_MARGIN_MULTI_CARD = 0.03;

interface Hard { hard: number; ace: boolean }
const add = (h: Hard, v: number): Hard => ({ hard: h.hard + (v === 11 ? 1 : v), ace: h.ace || v === 11 });
const best = (h: Hard) => (h.ace && h.hard + 10 <= 21 ? h.hard + 10 : h.hard);

// ------------------------------------------------------------------ dealer
export interface DealerDist { 17: number; 18: number; 19: number; 20: number; 21: number; bust: number; blackjack: number }

const dealerMemo = new Map<string, DealerDist>();
function dealerFrom(h: Hard, twoCards: boolean): DealerDist {
  const key = `${h.hard},${h.ace ? 1 : 0},${twoCards ? 2 : 1}`;
  const hit = dealerMemo.get(key);
  if (hit) return hit;
  const total = best(h);
  const out: DealerDist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 };
  if (h.hard > 21) out.bust = 1;
  else if (total >= 17) {
    if (total === 21 && twoCards) out.blackjack = 1;
    else (out as unknown as Record<number, number>)[total] = 1;
  } else {
    for (const [v, p] of DRAWS) {
      const d = dealerFrom(add(h, v), false);
      for (const k of Object.keys(out) as (keyof DealerDist)[]) out[k] += p * d[k];
    }
  }
  dealerMemo.set(key, out);
  return out;
}

/** Distribuição do resultado final do dealer dado o valor da carta aberta (2..11; Ás = 11). */
export function dealerDistribution(upValue: number): DealerDist {
  const start: Hard = { hard: upValue === 11 ? 1 : upValue, ace: upValue === 11 };
  const out: DealerDist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 };
  for (const [v, p] of DRAWS) {
    const d = dealerFrom(add(start, v), true); // segunda carta (a fechada, sem peek)
    for (const k of Object.keys(out) as (keyof DealerDist)[]) out[k] += p * d[k];
  }
  return out;
}

// ------------------------------------------------------------------ jogador
function standEV(total: number, d: DealerDist): number {
  let ev = d.bust - d.blackjack; // mão que não é blackjack natural perde para o blackjack do dealer
  for (const t of [17, 18, 19, 20, 21] as const) ev += d[t] * (total > t ? 1 : total === t ? 0 : -1);
  return ev;
}

class Solver {
  private noDouble = new Map<string, number>();
  private split = new Map<string, number>();
  constructor(private d: DealerDist) {}

  stand(h: Hard) { return standEV(best(h), this.d); }

  /** Melhor valor de uma mão já em jogo (sem Double/Split/Surrender): parar ou pedir. */
  bestNoDouble(h: Hard): number {
    if (h.hard > 21) return -1;
    const total = best(h);
    if (total === 21) return this.stand(h); // a mesa encerra a mão em 21
    const key = `${h.hard},${h.ace ? 1 : 0}`;
    const c = this.noDouble.get(key);
    if (c !== undefined) return c;
    const out = Math.max(this.stand(h), this.hit(h));
    this.noDouble.set(key, out);
    return out;
  }
  hit(h: Hard): number {
    let ev = 0;
    for (const [v, p] of DRAWS) ev += p * this.bestNoDouble(add(h, v));
    return ev;
  }
  double(h: Hard): number {
    let ev = 0;
    for (const [v, p] of DRAWS) {
      const n = add(h, v);
      ev += p * (n.hard > 21 ? -1 : this.stand(n));
    }
    return 2 * ev;
  }

  /** EV total (das duas mãos) de dividir um par de valor `c`, com `k` splits ainda permitidos (k ≥ 1). */
  splitEV(c: number, k: number): number {
    const key = `${c},${k}`;
    const hit = this.split.get(key);
    if (hit !== undefined) return hit;
    let one = 0;
    for (const [x, p] of DRAWS) one += p * this.splitHandValue(c, x, k - 1);
    const out = 2 * one;
    this.split.set(key, out);
    return out;
  }

  /** Valor de UMA mão resultante do split: carta `c` + carta nova `x`, com `kRem` splits ainda permitidos. */
  private splitHandValue(c: number, x: number, kRem: number): number {
    const h = add(add({ hard: 0, ace: false }, c), x);
    const total = best(h);
    const canResplit = x === c && kRem >= 1; // par por valor (10/J/Q/K valem 10)
    if (c === 11) {
      // Ases: uma carta só; sem Hit/Double. Re-split de ases permitido dentro do limite.
      let v = this.stand(h);
      if (canResplit) v = Math.max(v, this.splitEV(11, kRem));
      return v;
    }
    if (total === 21) return this.stand(h);
    let v = Math.max(this.stand(h), this.hit(h), this.double(h)); // Double após split permitido
    if (canResplit) v = Math.max(v, this.splitEV(c, kRem));
    return v;
  }
}

const solvers = new Map<number, Solver>();
const solverFor = (up: number) => solvers.get(up) ?? (solvers.set(up, new Solver(dealerDistribution(up))), solvers.get(up)!);

// ------------------------------------------------------------------ recomendação
export interface StrategyContext {
  /** Cartas da mão ativa. */
  cards: readonly Card[];
  /** Carta aberta do dealer. */
  dealerUp: Card;
  /** Ações que a mesa permite agora (vem do motor). */
  legal: readonly Action[];
  /** Quantos splits ainda são permitidos neste lugar (limite global de 3). */
  splitsLeft: number;
  fromSplit?: boolean;
  fromAces?: boolean;
}

export interface Recommendation {
  /** Ação recomendada; null = sem recomendação segura. */
  action: Action | null;
  /** Só havia uma ação disponível. */
  forced: boolean;
  /** EV estimado (por unidade apostada nesta mão) de cada ação disponível. */
  evs: Partial<Record<Action, number>>;
  explanation: string;
}

const NAME: Record<Action, string> = { hit: 'Pedir', stand: 'Parar', double: 'Dobrar', split: 'Dividir', surrender: 'Desistir' };
const fmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2).replace('.', ',')}`;
const UP_LABEL = (c: Card) => (c.rank === 'A' ? 'Ás' : c.rank);
const PRIORITY: Action[] = ['stand', 'hit', 'double', 'split', 'surrender'];

const WHY: Record<Action, string> = {
  stand: 'Parar: pedir mais uma carta arrisca mais do que o dealer tende a ganhar.',
  hit: 'Pedir: parar perde com frequência maior do que o risco de estourar.',
  double: 'Dobrar: mão favorável para aumentar a aposta recebendo uma única carta.',
  split: 'Dividir: duas mãos partindo desta carta têm melhor valor esperado do que jogar as duas cartas juntas.',
  surrender: 'Desistir: perder metade da aposta é melhor do que o valor esperado das outras opções.',
};

export function recommend(ctx: StrategyContext): Recommendation {
  const legal = PRIORITY.filter((a) => ctx.legal.includes(a));
  const none = (why: string): Recommendation => ({ action: null, forced: false, evs: {}, explanation: `Sem recomendação disponível: ${why}` });
  if (legal.length === 0) return none('nenhuma ação disponível.');
  if (!ctx.cards.length) return none('mão sem cartas.');
  const up = cardValue(ctx.dealerUp);
  const s = solverFor(up);
  let h: Hard = { hard: 0, ace: false };
  for (const c of ctx.cards) h = add(h, cardValue(c));
  if (h.hard > 21) return none('a mão já estourou.');

  if (legal.length === 1) {
    return { action: legal[0]!, forced: true, evs: {}, explanation: `${NAME[legal[0]!]} é a única ação disponível nesta mão.` };
  }

  const evs: Partial<Record<Action, number>> = {};
  for (const a of legal) {
    if (a === 'stand') evs.stand = s.stand(h);
    else if (a === 'hit') evs.hit = s.hit(h);
    else if (a === 'double') evs.double = s.double(h);
    else if (a === 'surrender') evs.surrender = -0.5;
    else if (a === 'split') {
      if (ctx.cards.length !== 2 || ctx.splitsLeft < 1) continue;
      evs.split = s.splitEV(cardValue(ctx.cards[0]!), ctx.splitsLeft);
    }
  }
  const ranked = (Object.keys(evs) as Action[]).sort((a, b) => evs[b]! - evs[a]! || PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  if (ranked.length < 2) return none('a situação não está coberta com segurança.');
  const [top, second] = ranked as [Action, Action];
  const gap = evs[top]! - evs[second]!;
  const margin = ctx.cards.length > 2 ? STRATEGY_MARGIN_MULTI_CARD : STRATEGY_MARGIN;
  if (gap < margin) {
    return { action: null, forced: false, evs, explanation: `Sem recomendação segura: ${NAME[top]} (${fmt(evs[top]!)}) e ${NAME[second]} (${fmt(evs[second]!)}) estão muito próximos para a estimativa usada (baralho infinito).` };
  }
  return {
    action: top, forced: false, evs,
    explanation: `${WHY[top]} Contra o ${UP_LABEL(ctx.dealerUp)} do dealer, valor esperado estimado de ${NAME[top]}: ${fmt(evs[top]!)} por unidade apostada (${NAME[second]}: ${fmt(evs[second]!)}).`,
  };
}

/** Insurance (2:1, metade da aposta): EV por unidade de Insurance = 2·(4/13) − 1·(9/13) = −1/13. */
export const INSURANCE_EV = (2 * 4 - 9) / 13;
export function recommendInsurance(): { action: 'decline'; ev: number; explanation: string } {
  return {
    action: 'decline', ev: INSURANCE_EV,
    explanation: `Recusar: o Insurance paga 2:1, mas o dealer tem blackjack em cerca de 31% das vezes com um Ás aberto (4 em 13 cartas valem 10); valor esperado estimado de ${fmt(INSURANCE_EV)} por unidade de Insurance.`,
  };
}

/** Quantos splits ainda são permitidos dado o que o lugar já fez. */
export const splitsLeft = (splitsDone: number) => Math.max(0, RULES.maxSplits - splitsDone);

export const STRATEGY_DISCLAIMER = 'Estimativa por valor esperado (baralho infinito como aproximação do shoe de 6 baralhos). Não garante lucro: o jogo tem vantagem da casa.';
