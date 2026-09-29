/** Todos os valores são centavos inteiros de créditos fictícios. */
export type Cents = number;

export const MIN_MAIN_BET: Cents = 500;
export const MIN_SIDE_BET: Cents = 250;
export const MAX_BUYIN: Cents = 100_000;

export function isValidCents(v: unknown): v is Cents {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

/** Valida buy-in/rebuy: inteiro positivo, no máximo R$ 1.000,00 por operação. */
export function validateBuyAmount(v: unknown): string | null {
  if (!isValidCents(v)) return 'INVALID_AMOUNT';
  if (v > MAX_BUYIN) return 'EXCEEDS_MAX_BUYIN';
  return null;
}

export function formatBRL(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${(abs % 100).toString().padStart(2, '0')}`;
}
