import { cardValue, type Card } from './cards';

export interface HandValue { total: number; soft: boolean; bust: boolean }

/** Ás vale 11 enquanto não estourar; senão 1. `soft` = há um Ás contado como 11. */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) { total += cardValue(c); if (c.rank === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0, bust: total > 21 };
}

export const isTenValue = (c: Card) => cardValue(c) === 10;

/** Duas cartas: Ás + carta de valor 10. (Se conta como "natural" numa mão de split é regra da rodada.) */
export function isTwoCardBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}
