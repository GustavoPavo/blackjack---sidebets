import { formatBRL } from '@bj/engine';
import { decomposeChips } from './chips';

const MAX_STACKS = 3;
const MAX_PER_STACK = 6;

/** Pequenas pilhas de fichas para um valor apostado (decorativo; o valor total aparece em texto). */
export function ChipStack({ amount }: { amount: number }) {
  if (amount <= 0) return <span className="chipstack empty" aria-hidden="true" />;
  const stacks = decomposeChips(amount).slice(0, MAX_STACKS);
  return (
    <span className="chipstack" aria-hidden="true">
      {stacks.map((s) => (
        <span key={s.value} className="stack">
          {Array.from({ length: Math.min(s.count, MAX_PER_STACK) }, (_, i) => (
            <i key={i} className={`pchip chip-${s.value}`} style={{ bottom: `${i * 4}px` }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** Área de aposta clicável: rótulo, fichas e valor total. */
export function BetSpot({ label, amount, disabled, title, onAdd, onRemove, removeLabel, kind }: {
  label: string; amount: number; disabled?: boolean; title?: string; kind: string;
  onAdd: () => void; onRemove?: () => void; removeLabel?: string;
}) {
  return (
    <div className={`bet ${kind} ${amount > 0 ? 'on' : 'off'}`}>
      <button className={`betbtn ${amount > 0 ? 'has-bet' : ''}`} disabled={disabled} title={title} onClick={onAdd}>
        <span className="bet-label">{label}</span>
        <ChipStack amount={amount} />
        <b className="bet-amount">{formatBRL(amount)}</b>
      </button>
      {amount > 0 && onRemove && (
        <button className="x" disabled={disabled} aria-label={removeLabel} onClick={onRemove}>✕</button>
      )}
    </div>
  );
}
