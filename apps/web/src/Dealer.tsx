import { CardView } from './CardView';
import { useGame } from './gameContext';

/** Dealer compartilhado + shoe (origem da animação das cartas). */
export function Dealer() {
  const { table, pres, fly } = useGame();
  const d = table.dealer;
  return (
    <section className={`dealer ${d.cards.length === 0 ? 'empty' : ''}`} aria-label="Dealer">
      <div className="dealer-head">
        <h2>Dealer</h2>
        <div id="shoe" className="shoe" title={`Shoe: ${table.shoeRemaining} cartas`}>
          <i /><i /><i />
          {table.shoeRemaining > 0 && <small>{table.shoeRemaining}</small>}
        </div>
      </div>
      <div className="cards">
        {d.cards.map((c, i) => (
          <CardView key={`${d.cardSeq[i]}-${i === 1 && pres.holeUp}`} card={c} fly={fly}
            hidden={d.cardSeq[i]! > pres.shownSeq}
            faceDown={i === 1 && !pres.holeUp}
            flip={i === 1 && pres.holeUp} />
        ))}
      </div>
      {d.value && !pres.presenting && (
        <div className="meta"><b>{d.value.total}{d.value.soft ? ' (soft)' : ''}</b>{d.hasBlackjack ? ' · Blackjack' : ''}</div>
      )}
    </section>
  );
}
