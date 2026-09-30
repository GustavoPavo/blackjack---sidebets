import { seatNumber } from '@bj/engine';

export const SEAT_COUNT = 5;

/**
 * Na visão do jogador o lugar 1 fica à DIREITA e o lugar 5 à ESQUERDA.
 * Coluna da grade (1 = esquerda … 5 = direita) para o lugar de índice interno 0..4.
 * Distribuição e turnos seguem a ordem crescente dos lugares (1 → 5, começando pela direita da tela).
 */
export const visualColumn = (seatIndex: number) => SEAT_COUNT - seatIndex;

/** Números dos lugares, da esquerda para a direita da tela: [5, 4, 3, 2, 1]. */
export const SEAT_VISUAL_ORDER: number[] = Array.from({ length: SEAT_COUNT }, (_, i) => i)
  .sort((a, b) => visualColumn(a) - visualColumn(b))
  .map(seatNumber);
