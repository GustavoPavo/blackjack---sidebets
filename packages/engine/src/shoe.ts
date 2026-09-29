import { RANKS, SUITS, type Card } from './cards';

/** RNG injetável: (): número em [0,1). Em produção, o servidor usa crypto. */
export type Rng = () => number;

export function buildShoe(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  return cards;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class Shoe {
  private cards: Card[];
  constructor(cards: Card[]) { this.cards = cards.slice(); }
  static fresh(rng: Rng, decks = 6) { return new Shoe(shuffle(buildShoe(decks), rng)); }
  /** Shoe determinístico para testes: a primeira carta da lista é a primeira a sair. */
  static stacked(cards: Card[]) { return new Shoe(cards); }
  get remaining() { return this.cards.length; }
  draw(): Card {
    const c = this.cards.shift();
    if (!c) throw new Error('SHOE_EMPTY');
    return c;
  }
}
