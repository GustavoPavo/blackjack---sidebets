import { useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '@bj/engine';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const SUIT_NAME = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' } as const;
const RANK_NAME: Record<string, string> = { A: 'Ás', K: 'Rei', Q: 'Dama', J: 'Valete' };

export const cardLabel = (c: Card) => `${RANK_NAME[c.rank] ?? c.rank} de ${SUIT_NAME[c.suit]}`;

interface Props {
  card: Card | null;
  /** Ainda não distribuída na apresentação: ocupa o espaço, invisível. */
  hidden?: boolean;
  faceDown?: boolean;
  /** Carta que acabou de ser virada (revelação da carta fechada do dealer). */
  flip?: boolean;
  /** Anima a carta saindo do shoe ao ser revelada. Desligado com movimento reduzido. */
  fly?: boolean;
}

/**
 * Carta. O conteúdo vem sempre do servidor; aqui só há apresentação. Ao passar de `hidden` para visível,
 * a carta "voa" do shoe (#shoe) até a sua posição.
 */
export function CardView({ card, hidden, faceDown, flip, fly = true }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const wasHidden = useRef(!!hidden);
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (wasHidden.current && !hidden && fly && ref.current) {
      const shoe = typeof document !== 'undefined' ? document.getElementById('shoe') : null;
      if (shoe) {
        const a = shoe.getBoundingClientRect();
        const b = ref.current.getBoundingClientRect();
        setFrom({ x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2) });
      }
    }
    wasHidden.current = !!hidden;
  }, [hidden, fly]);

  const style = from ? ({ '--fly-x': `${from.x}px`, '--fly-y': `${from.y}px` } as React.CSSProperties) : undefined;
  if (hidden) return <span ref={ref} className="card ghost" aria-hidden="true" />;
  const motion = from ? 'flying' : fly ? '' : 'still';
  if (!card || faceDown) return <span ref={ref} className={`card back shown ${motion}`} style={style} aria-label="Carta fechada" />;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span ref={ref} style={style} className={`card ${red ? 'red' : 'black'} shown ${flip ? 'flipping' : motion}`} role="img" aria-label={cardLabel(card)}>
      <span className="corner tl"><b>{card.rank}</b><i>{SUIT[card.suit]}</i></span>
      <span className="pip">{SUIT[card.suit]}</span>
      <span className="corner br"><b>{card.rank}</b><i>{SUIT[card.suit]}</i></span>
    </span>
  );
}
