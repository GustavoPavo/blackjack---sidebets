import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@bj/engine';
import { maxSeq, planReveal, type RevealState } from './reveal';

/** Tempos da animação (ms). Testes podem reduzir. */
export const ANIMATION = { firstMs: 250, stepMs: 420, holdMs: 500 };

export interface Presentation extends RevealState { presenting: boolean }

/**
 * Mantém o que já foi "mostrado" na mesa. Enquanto `presenting`, a interface esconde totais, resultados,
 * saldo atualizado e a mensagem final (que só aparece depois da distribuição, dos turnos e do dealer).
 */
export function usePresentation(view: TableView | null): Presentation {
  const [pres, setPres] = useState<Presentation>({ shownSeq: 0, holeUp: false, presenting: false });
  const ref = useRef(pres);
  const started = useRef(false);
  const set = (next: Presentation) => { ref.current = next; setPres(next); };

  useEffect(() => {
    if (!view) return;
    if (!started.current) {
      started.current = true; // primeira carga: mostra o estado atual sem animar
      set({ shownSeq: maxSeq(view), holeUp: view.dealer.cards.length > 1 && view.dealer.cards[1] !== null, presenting: false });
      return;
    }
    const base = ref.current;
    const state: RevealState = view.dealer.cards.length === 0 ? { shownSeq: base.shownSeq, holeUp: false } : base;
    const steps = planReveal(view, state);
    if (steps.length === 0) { set({ ...state, presenting: false }); return; }
    set({ ...state, presenting: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const run = () => {
      const step = steps[i++]!;
      const cur = ref.current;
      set(step.type === 'card' ? { ...cur, shownSeq: step.seq } : { ...cur, holeUp: true });
      timers.push(setTimeout(i < steps.length ? run : () => set({ ...ref.current, presenting: false }), i < steps.length ? ANIMATION.stepMs : ANIMATION.holdMs));
    };
    timers.push(setTimeout(run, ANIMATION.firstMs));
    return () => timers.forEach(clearTimeout);
  }, [view]);

  // Derivado no próprio render: no instante em que chega um estado novo (antes do efeito rodar) já há cartas
  // por mostrar, então saldo, resultados e mensagem final não podem vazar.
  const pending = view !== null && started.current && view.dealer.cards.length > 0 && planReveal(view, pres).length > 0;
  return { ...pres, presenting: pres.presenting || pending };
}
