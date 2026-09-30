import type { TableView } from '@bj/engine';

/**
 * Animação carta por carta. O servidor resolve tudo de uma vez; o cliente só decide QUANDO mostrar
 * cada carta, seguindo a ordem global de saque (`seq`) que vem do servidor.
 */
export interface RevealState { shownSeq: number; holeUp: boolean }
export type RevealStep = { type: 'card'; seq: number } | { type: 'flip' };

export function allSeqs(view: TableView): number[] {
  return [...view.seats.flatMap((s) => s.hands.flatMap((h) => h.cardSeq)), ...view.dealer.cardSeq];
}
export const maxSeq = (view: TableView) => allSeqs(view).reduce((a, b) => Math.max(a, b), 0);

/** Passos a executar para ir do estado mostrado até o estado do servidor. */
export function planReveal(view: TableView, state: RevealState): RevealStep[] {
  const fresh = allSeqs(view).filter((q) => q > state.shownSeq).sort((a, b) => a - b);
  const steps: RevealStep[] = fresh.map((seq) => ({ type: 'card', seq }));
  const holeRevealedByServer = view.dealer.cards.length > 1 && view.dealer.cards[1] !== null;
  if (holeRevealedByServer && !state.holeUp) {
    // a carta fechada vira depois das cartas dos jogadores e antes das compras do dealer
    const holeSeq = view.dealer.cardSeq[1]!;
    const drawSeqs = new Set(view.dealer.cardSeq.filter((q) => q > holeSeq));
    const at = steps.findIndex((s) => s.type === 'card' && drawSeqs.has(s.seq));
    steps.splice(at === -1 ? steps.length : at, 0, { type: 'flip' });
  }
  return steps;
}
