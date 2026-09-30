/** Valores das fichas (centavos) — uma cor por valor (ver .chip-* em styles.css). */
export const CHIP_VALUES = [250, 500, 1000, 2500, 5000, 10000] as const;

/**
 * Decompõe um valor em fichas, das maiores para as menores. Um resto que não seja múltiplo da menor
 * ficha vira uma ficha "avulsa" (value = resto).
 */
export function decomposeChips(amount: number): { value: number; count: number }[] {
  const out: { value: number; count: number }[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const v of [...CHIP_VALUES].reverse()) {
    const count = Math.floor(rest / v);
    if (count > 0) { out.push({ value: v, count }); rest -= count * v; }
  }
  if (rest > 0) out.push({ value: rest, count: 1 });
  return out;
}
