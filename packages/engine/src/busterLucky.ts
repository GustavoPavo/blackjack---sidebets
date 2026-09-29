import type { Cents } from './money';

/** Lucro (N:1) por total de cartas do dealer no estouro. */
export function busterLuckyMultiplier(dealerCards: number): number {
  if (dealerCards < 3) return 0;
  if (dealerCards === 3) return 1;
  if (dealerCards === 4) return 3;
  if (dealerCards === 5) return 6;
  if (dealerCards === 6) return 30;
  if (dealerCards === 7) return 100;
  return 200;
}

export interface SideBetResult { won: boolean; profit: Cents; payout: Cents; label: string }

/** payout = retorno total (aposta + lucro); perdeu → 0. */
export function settleBusterLucky(bet: Cents, dealerBust: boolean, dealerCards: number): SideBetResult {
  if (!dealerBust) return { won: false, profit: -bet, payout: 0, label: 'Dealer não estourou' };
  const m = busterLuckyMultiplier(dealerCards);
  if (m === 0) return { won: false, profit: -bet, payout: 0, label: 'Sem pagamento' };
  return { won: true, profit: bet * m, payout: bet * (m + 1), label: `Buster ${dealerCards} cartas (${m}:1)` };
}
