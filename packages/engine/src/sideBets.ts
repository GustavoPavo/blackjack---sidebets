import { isRed, type Card, type Rank } from './cards';
import type { Cents } from './money';
import type { SideBetResult } from './busterLucky';

/** Liquida uma side bet com multiplicador de lucro N:1 (null = perdeu). payout = aposta + lucro. */
export function settleMultiplier(bet: Cents, multiplier: number | null, label: string): SideBetResult {
  if (multiplier === null) return { won: false, profit: -bet, payout: 0, label };
  return { won: true, profit: bet * multiplier, payout: bet * (multiplier + 1), label };
}

// ---------------------------------------------------------------- 23+1
export type TwentyThreeCategory = 'suitedTrips' | 'straightFlush' | 'threeOfAKind' | 'straight' | 'flush';

export const TWENTY_THREE_PAYS: Record<TwentyThreeCategory, number> = {
  suitedTrips: 100, straightFlush: 40, threeOfAKind: 30, straight: 10, flush: 5,
};
export const TWENTY_THREE_LABELS: Record<TwentyThreeCategory, string> = {
  suitedTrips: 'Suited Trips', straightFlush: 'Straight Flush', threeOfAKind: 'Three of a Kind',
  straight: 'Straight', flush: 'Flush',
};

const RANK_NUM: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

/**
 * Sequências aceitas (decisão do dono da mesa): Ás é alto e baixo, mas só A-2-3 e Q-K-A
 * (não vale K-A-2). Demais sequências: três ranks consecutivos (2-3-4 … J-Q-K).
 */
export function isStraight(cards: readonly Card[]): boolean {
  const n = cards.map((c) => RANK_NUM[c.rank]).sort((a, b) => a - b);
  if (n.length !== 3) return false;
  if (n[1] === n[0]! + 1 && n[2] === n[1]! + 1) return true; // inclui A-2-3 (Ás = 1)
  return n[0] === 1 && n[1] === 12 && n[2] === 13; // Q-K-A (Ás = alto)
}

/** Categoria de maior prioridade das 3 cartas (2 do jogador + 1 aberta do dealer), ou null. */
export function classify23Plus1(player: readonly [Card, Card], dealerUp: Card): TwentyThreeCategory | null {
  const cs = [player[0], player[1], dealerUp];
  const sameRank = cs.every((c) => c.rank === cs[0]!.rank);
  const suited = cs.every((c) => c.suit === cs[0]!.suit);
  const straight = isStraight(cs);
  if (sameRank && suited) return 'suitedTrips';
  if (straight && suited) return 'straightFlush';
  if (sameRank) return 'threeOfAKind';
  if (straight) return 'straight';
  if (suited) return 'flush';
  return null;
}

export function settle23Plus1(bet: Cents, player: readonly [Card, Card], dealerUp: Card): SideBetResult {
  const cat = classify23Plus1(player, dealerUp);
  return cat
    ? settleMultiplier(bet, TWENTY_THREE_PAYS[cat], `${TWENTY_THREE_LABELS[cat]} (${TWENTY_THREE_PAYS[cat]}:1)`)
    : settleMultiplier(bet, null, 'Sem combinação');
}

// ---------------------------------------------------------------- Pares
export type PairCategory = 'perfect' | 'coloured' | 'redBlack';
export const PAIR_PAYS: Record<PairCategory, number> = { perfect: 25, coloured: 12, redBlack: 6 };
export const PAIR_LABELS: Record<PairCategory, string> = {
  perfect: 'Perfect Pair', coloured: 'Coloured Pair', redBlack: 'Red/Black Pair',
};

/**
 * Par = mesmo rank (QQ, 7-7; Q-K NÃO é par). Perfect: mesmo naipe. Coloured: mesma cor, naipes
 * diferentes. Red/Black: cores diferentes.
 */
export function classifyPair(a: Card, b: Card): PairCategory | null {
  if (a.rank !== b.rank) return null;
  if (a.suit === b.suit) return 'perfect';
  return isRed(a) === isRed(b) ? 'coloured' : 'redBlack';
}

export function settlePairs(bet: Cents, a: Card, b: Card): SideBetResult {
  const cat = classifyPair(a, b);
  return cat
    ? settleMultiplier(bet, PAIR_PAYS[cat], `${PAIR_LABELS[cat]} (${PAIR_PAYS[cat]}:1)`)
    : settleMultiplier(bet, null, 'Sem par');
}
