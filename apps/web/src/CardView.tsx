import type { Card } from '@bj/engine';

const SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

export function CardView({ card }: { card: Card | null }) {
  if (!card) return <span className="card back" aria-label="Carta fechada" />;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span className={`card ${red ? 'red' : 'black'}`} aria-label={`${card.rank} de ${card.suit}`}>
      <span className="rank">{card.rank}</span>
      <span className="suit">{SYMBOL[card.suit]}</span>
    </span>
  );
}
