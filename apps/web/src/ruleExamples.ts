import {
  busterLuckyMultiplier, classify23Plus1, classifyPair, TWENTY_THREE_LABELS, TWENTY_THREE_PAYS, PAIR_LABELS, PAIR_PAYS,
  type Card, type PairCategory, type TwentyThreeCategory,
} from '@bj/engine';

const k = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

/**
 * Exemplos exibidos em "Regras e pagamentos". Os PAGAMENTOS e os NOMES vêm das constantes do motor (não são
 * digitados aqui) e os testes verificam que cada exemplo é classificado pelo motor na categoria indicada.
 */
export interface Example23 { category: TwentyThreeCategory; label: string; ratio: number; player: [Card, Card]; dealer: Card }
const RAW_23: { category: TwentyThreeCategory; player: [Card, Card]; dealer: Card }[] = [
  { category: 'suitedTrips', player: [k('7', 'H'), k('7', 'H')], dealer: k('7', 'H') },
  { category: 'straightFlush', player: [k('4', 'H'), k('5', 'H')], dealer: k('6', 'H') },
  { category: 'threeOfAKind', player: [k('7', 'H'), k('7', 'S')], dealer: k('7', 'D') },
  { category: 'straight', player: [k('4', 'H'), k('5', 'S')], dealer: k('6', 'D') },
  { category: 'flush', player: [k('2', 'H'), k('9', 'H')], dealer: k('K', 'H') },
];
export const EXAMPLES_23: Example23[] = RAW_23.map((e) => ({ ...e, label: TWENTY_THREE_LABELS[e.category], ratio: TWENTY_THREE_PAYS[e.category] }));

/** Sequências com Ás aceitas: só A-2-3 e Q-K-A (o Ás vale baixo ou alto). */
export const ACE_STRAIGHTS: { label: string; player: [Card, Card]; dealer: Card; valid: boolean }[] = [
  { label: 'A-2-3', player: [k('A', 'S'), k('2', 'H')], dealer: k('3', 'D'), valid: true },
  { label: 'Q-K-A', player: [k('Q', 'S'), k('K', 'H')], dealer: k('A', 'D'), valid: true },
  { label: 'K-A-2', player: [k('K', 'S'), k('A', 'H')], dealer: k('2', 'D'), valid: false },
];

export interface ExamplePair { category: PairCategory; label: string; ratio: number; cards: [Card, Card]; note: string }
export const EXAMPLES_PAIRS: ExamplePair[] = [
  { category: 'perfect', cards: [k('Q', 'H'), k('Q', 'H')], note: 'mesmo rank e mesmo naipe' },
  { category: 'coloured', cards: [k('Q', 'H'), k('Q', 'D')], note: 'mesmo rank, mesma cor, naipes diferentes' },
  { category: 'redBlack', cards: [k('Q', 'H'), k('Q', 'S')], note: 'mesmo rank, cores diferentes' },
].map((e) => ({ ...e, category: e.category as PairCategory, label: PAIR_LABELS[e.category as PairCategory], ratio: PAIR_PAYS[e.category as PairCategory], cards: e.cards as [Card, Card] }));
/** Não é par: precisa ser o mesmo rank. */
export const NOT_A_PAIR: [Card, Card] = [k('Q', 'H'), k('K', 'H')];

export const BUSTER_CARD_COUNTS = [3, 4, 5, 6, 7, 8] as const;
export const busterRows = (bet: number) => BUSTER_CARD_COUNTS.map((n) => {
  const ratio = busterLuckyMultiplier(n);
  return { cards: n, plus: n === 8, ratio, profit: bet * ratio, totalReturn: bet * (ratio + 1) };
});

/** Usado pelos testes: o motor confirma a categoria de cada exemplo. */
export const engineAgrees = () => ({
  c23: EXAMPLES_23.every((e) => classify23Plus1(e.player, e.dealer) === e.category),
  ace: ACE_STRAIGHTS.every((e) => (classify23Plus1(e.player, e.dealer) === 'straight' || classify23Plus1(e.player, e.dealer) === 'flush' || classify23Plus1(e.player, e.dealer) === null) && (classify23Plus1(e.player, e.dealer) === 'straight') === e.valid),
  pairs: EXAMPLES_PAIRS.every((e) => classifyPair(e.cards[0], e.cards[1]) === e.category) && classifyPair(NOT_A_PAIR[0], NOT_A_PAIR[1]) === null,
});
