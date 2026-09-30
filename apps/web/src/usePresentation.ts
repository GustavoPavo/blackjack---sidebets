import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableView } from '@bj/engine';
import { maxSeq, planReveal, type RevealState, type RevealStep } from './reveal';

/** Tempos da apresentação (ms) na velocidade normal. Os testes podem reduzir. */
export const ANIMATION = { firstMs: 250, stepMs: 420, holdMs: 500 };
export interface Timing { firstMs: number; stepMs: number; holdMs: number }

/** Velocidade "rápida" = metade; movimento reduzido = passos curtos, sem deslocamento (ver CardView `fly`). */
export function timingFor(speed: 'normal' | 'fast', reduced: boolean): Timing {
  const k = speed === 'fast' ? 0.5 : 1;
  const t = { firstMs: ANIMATION.firstMs * k, stepMs: ANIMATION.stepMs * k, holdMs: ANIMATION.holdMs * k };
  return reduced ? { firstMs: Math.min(t.firstMs, 80), stepMs: Math.min(t.stepMs, 140), holdMs: Math.min(t.holdMs, 250) } : t;
}

/** `init`: o estado inicial do servidor já foi absorvido (antes disso a mesa é exibida como veio, sem animar). */
export interface Presentation extends RevealState { presenting: boolean; init: boolean }
export interface PresentationApi extends Presentation {
  /** Mostra tudo de uma vez (ex.: ao voltar do segundo plano), sem animar. */
  snap: (view: TableView) => void;
}

/**
 * Mantém o que já foi "mostrado" na mesa. Enquanto `presenting`, a interface esconde totais, resultados,
 * saldo atualizado e a mensagem final (que só aparece depois da distribuição, dos turnos e do dealer).
 * O servidor decide tudo; aqui só se escolhe QUANDO mostrar cada carta, pela ordem de saque (`seq`).
 */
export function usePresentation(view: TableView | null, timing: Timing = ANIMATION, onStep?: (s: RevealStep) => void): PresentationApi {
  const [pres, setPres] = useState<Presentation>({ shownSeq: Infinity, holeUp: true, presenting: false, init: false });
  const ref = useRef(pres);
  const started = useRef(false);
  const timingRef = useRef(timing);
  timingRef.current = timing;
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const set = (next: Presentation) => { ref.current = next; setPres(next); };

  useEffect(() => {
    if (!view) return;
    if (!started.current) {
      started.current = true; // primeira carga: mostra o estado atual sem animar
      set({ shownSeq: maxSeq(view), holeUp: view.dealer.cards.length > 1 && view.dealer.cards[1] !== null, presenting: false, init: true });
      return;
    }
    const base = ref.current;
    const state: RevealState = view.dealer.cards.length === 0 ? { shownSeq: base.shownSeq, holeUp: false } : base;
    const steps = planReveal(view, state);
    if (steps.length === 0) { set({ ...base, ...state, presenting: false }); return; }
    set({ ...base, ...state, presenting: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const run = () => {
      const step = steps[i++]!;
      const cur = ref.current;
      set(step.type === 'card' ? { ...cur, shownSeq: step.seq } : { ...cur, holeUp: true });
      stepRef.current?.(step);
      const last = i >= steps.length;
      timers.push(setTimeout(last ? () => set({ ...ref.current, presenting: false }) : run, last ? timingRef.current.holdMs : timingRef.current.stepMs));
    };
    timers.push(setTimeout(run, timingRef.current.firstMs));
    return () => timers.forEach(clearTimeout);
  }, [view]);

  const snap = useCallback((v: TableView) => {
    ref.current = { shownSeq: maxSeq(v), holeUp: v.dealer.cards.length > 1 && v.dealer.cards[1] !== null, presenting: false, init: true };
    setPres(ref.current);
  }, []);

  // Derivado no próprio render: no instante em que chega um estado novo (antes do efeito rodar) já há cartas
  // por mostrar, então saldo, resultados e mensagem final não podem vazar.
  const pending = view !== null && pres.init && view.dealer.cards.length > 0 && planReveal(view, pres).length > 0;
  return { ...pres, presenting: pres.presenting || pending, snap };
}
