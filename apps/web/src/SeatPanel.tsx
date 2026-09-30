import { formatBRL, type BetKind, type SeatView } from '@bj/engine';
import { useGame } from './gameContext';
import { Hands } from './Hands';
import { BET_LABEL, BetSpots, InsuranceActions, SeatActions } from './SeatControls';

const OUTCOME_LABEL: Record<string, string> = {
  win: 'ganhou', lose: 'perdeu', push: 'empate', blackjack: 'blackjack', bust: 'estourou', surrender: 'desistência',
};

/** Badge de lugar/mão ativos (diferencia o lugar da vez). */
export function TurnBadge({ seat }: { seat: SeatView }) {
  const { table, pres } = useGame();
  if (table.turn?.seat !== seat.index || pres.presenting) return null;
  return <span className="turn-badge">▶ {seat.mine ? 'Sua vez' : 'Vez'}</span>;
}

/**
 * Um LUGAR da mesa (desktop e celular na horizontal). Não há carteira nem buy-in aqui: o saldo é do jogador.
 * `compact` (celular na horizontal): sem botões internos; toque seleciona o lugar e os controles ficam na barra inferior.
 */
export function SeatPanel({ seat, compact }: { seat: SeatView; compact?: boolean }) {
  const { table, pres, selectedSeat, selectSeat, hasWallet } = useGame();
  const n = seat.number;
  const showOutcome = !pres.presenting;
  const isTurnSeat = table.turn?.seat === seat.index && !pres.presenting;
  const selected = compact && selectedSeat === seat.index;
  const select = compact ? () => selectSeat(seat.index) : undefined;

  if (!seat.playerId) {
    return (
      <section className={`seat empty ${selected ? 'selected' : ''}`} data-seat={n} aria-label={`Lugar ${n}`} onClick={select}>
        <h3>Lugar {n}</h3>
        <p className="avail">Lugar disponível</p>
        {!compact && <SeatActions seat={seat} />}
        {!seat.canTake && table.phase === 'BETTING' && !compact && <small>{hasWallet ? 'Indisponível agora.' : 'Faça o buy-in inicial (no topo) para sentar.'}</small>}
        {table.phase !== 'BETTING' && !compact && <small>Disponível entre rodadas.</small>}
      </section>
    );
  }

  return (
    <section className={`seat ${isTurnSeat ? 'turn' : ''} ${seat.mine ? 'mine' : ''} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      data-seat={n} aria-label={`Lugar ${n}`} onClick={select}>
      <header>
        <h3>{seat.playerName} <small>(lugar {n}{seat.mine ? ' · você' : ''})</small></h3>
        <TurnBadge seat={seat} />
      </header>

      <Hands seat={seat} />
      <BetSpots seat={seat} />

      {!compact && (
        <>
          <SeatActions seat={seat} />
          <InsuranceActions seat={seat} />
        </>
      )}
      {seat.insurance.amount > 0 && <small>Insurance: {formatBRL(seat.insurance.amount)}</small>}

      {!compact && showOutcome && seat.results.length > 0 && (
        <ul className="results" aria-label={`Resultados do lugar ${n}`}>
          {seat.results.map((r, i) => (
            <li key={i} className={r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}>
              {BET_LABEL[r.kind as BetKind] ?? 'Insurance'}{r.handIndex !== undefined && seat.hands.length > 1 ? ` (mão ${r.handIndex + 1})` : ''}: {OUTCOME_LABEL[r.outcome]} — {r.label} · {r.net >= 0 ? '+' : ''}{formatBRL(r.net)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
