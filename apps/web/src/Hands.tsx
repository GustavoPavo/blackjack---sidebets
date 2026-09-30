import { useEffect, useRef } from 'react';
import { formatBRL, type SeatView } from '@bj/engine';
import { CardView } from './CardView';
import { ChipStack } from './ChipStack';
import { useGame } from './gameContext';
import { usePrefs } from './prefs';

const STATUS_LABEL: Record<string, string> = {
  playing: '', stood: 'Parou', busted: 'Estourou', surrendered: 'Desistiu', blackjack: 'Blackjack!',
};

/**
 * Mãos de um lugar. Com split há várias mãos: a mão ATIVA (da vez) é destacada e as demais ficam
 * esmaecidas. `strip`: rolagem horizontal interna com encaixe (celular na vertical), sem rolar a página.
 */
export function Hands({ seat, strip, showChips }: { seat: SeatView; strip?: boolean; showChips?: boolean }) {
  const { pres, table, fly } = useGame();
  const { reducedMotion } = usePrefs();
  const ref = useRef<HTMLDivElement>(null);
  const showOutcome = !pres.presenting; // totais e resultados só depois da animação
  const isTurnSeat = table.turn?.seat === seat.index && !pres.presenting;
  const activeIdx = seat.hands.findIndex((h) => h.active);

  useEffect(() => {
    if (!strip || activeIdx < 0 || pres.presenting) return;
    const el = ref.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [strip, activeIdx, pres.presenting, reducedMotion, seat.hands.length]);

  const go = (delta: number) => {
    const i = Math.min(seat.hands.length - 1, Math.max(0, (activeIdx >= 0 ? activeIdx : 0) + delta));
    (ref.current?.children[i] as HTMLElement | undefined)?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className={`hands ${strip ? 'strip' : ''} ${seat.hands.length > 1 ? 'multi' : ''}`}>
      {seat.hands.length === 0 && <span className="muted">Sem cartas</span>}
      <div className="hands-row" ref={ref}>
        {seat.hands.map((h, i) => {
          const active = h.active && !pres.presenting;
          return (
            <div key={h.cardSeq[0]}
              className={`hand ${active ? 'active' : ''} ${isTurnSeat && !active && seat.hands.length > 1 ? 'dim' : ''} ${h.fromSplit ? 'from-split' : ''} ${showOutcome ? h.status : ''}`}
              aria-label={`Mão ${i + 1} do lugar ${seat.number}`}>
              {seat.hands.length > 1 && <span className="hand-tag">Mão {i + 1}/{seat.hands.length}{active ? ' · ativa' : ''}</span>}
              <div className="cards">
                {h.cards.map((c, j) => <CardView key={h.cardSeq[j]} card={c} fly={fly} hidden={h.cardSeq[j]! > pres.shownSeq} />)}
              </div>
              {showOutcome && (
                <div className="meta">
                  <b>{h.value.total}{h.value.soft ? ' (soft)' : ''}</b> · {formatBRL(h.bet)}
                  {STATUS_LABEL[h.status] && <em> {STATUS_LABEL[h.status]}</em>}
                  {h.doubled && <em> Double</em>}
                </div>
              )}
              {showChips && <ChipStack amount={h.bet} />}
            </div>
          );
        })}
      </div>
      {strip && seat.hands.length > 1 && (
        <div className="hand-nav">
          <button className="ghost small" aria-label="Mão anterior" onClick={() => go(-1)}>‹</button>
          <span aria-hidden="true">{seat.hands.map((_, i) => <i key={i} className={i === activeIdx ? 'dot on' : 'dot'} />)}</span>
          <button className="ghost small" aria-label="Próxima mão" onClick={() => go(1)}>›</button>
        </div>
      )}
    </div>
  );
}
