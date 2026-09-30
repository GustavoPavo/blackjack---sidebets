import type { Card } from '@bj/engine';

const SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

/** `hidden`: a carta ainda não foi "distribuída" na animação (mantém o espaço, invisível). */
export function CardView({ card, hidden, faceDown }: { card: Card | null; hidden?: boolean; faceDown?: boolean }) {
  if (hidden) return <span className="card ghost" aria-hidden="true" />;
  if (!card || faceDown) return <span className="card back deal-in" aria-label="Carta fechada" />;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span className={`card ${red ? 'red' : 'black'} deal-in`} aria-label={`${card.rank} de ${card.suit}`}>
      <span className="rank">{card.rank}</span>
      <span className="suit">{SYMBOL[card.suit]}</span>
    </span>
  );
}
