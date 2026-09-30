/**
 * Baralho FIXO do tutorial (decisão do servidor, nunca do frontend): o jogador recebe 5♥ 6♦ (11) contra o 6♠ do
 * dealer (carta fechada 10♣). Pedir ou dobrar dá 9♣ (20); o dealer compra 8♦ (16+8) e estoura. Depois, cartas de sobra.
 * Formato: rank + naipe (S, H, D, C).
 */
export const TUTORIAL_SHOE: readonly string[] = [
  '5H', '6S', '6D', '10C', '9C', '8D',
  ...'2H 3D 4C 5S 6H 7D 8C 9S 10H JD QC KS 2C 3H 4D 5C 6S 7H 8D 9C'.split(' '),
];
