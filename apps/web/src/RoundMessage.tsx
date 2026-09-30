import { formatBRL, type PlayerRoundSummary } from '@bj/engine';
import { BET_LABEL } from './SeatControls';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatBRL(Math.abs(n))}`;

/** Mensagem destacada do resultado líquido total da rodada + detalhamento opcional por lugar e aposta. */
export function RoundMessage({ summary, floating }: { summary: PlayerRoundSummary; floating?: boolean }) {
  return (
    <section className={`round-msg ${summary.message.kind} ${floating ? 'floating' : ''}`} role="status" aria-live="polite">
      <strong className="big">{summary.message.text}</strong>
      <details>
        <summary>Detalhes por lugar e aposta</summary>
        <ul>
          {summary.seats.map((s) => (
            <li key={s.seat}>
              <b>Lugar {s.number}: {signed(s.net)}</b>
              <ul>
                {s.items.map((it, i) => (
                  <li key={i}>
                    {BET_LABEL[it.kind as keyof typeof BET_LABEL] ?? 'Insurance'}
                    {it.handIndex !== undefined && s.items.filter((x) => x.kind === 'main').length > 1 ? ` (mão ${it.handIndex + 1})` : ''}
                    : {it.label} · {signed(it.net)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
