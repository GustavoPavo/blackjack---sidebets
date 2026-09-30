import { formatBRL } from '@bj/engine';
import { useGame } from './gameContext';
import { Hands } from './Hands';
import { visualColumn } from './layout';
import { BetSpots, SeatActions } from './SeatControls';
import { TurnBadge } from './SeatPanel';

/** Faixa com os 5 lugares na ordem visual 5, 4, 3, 2, 1 (celular na vertical): toque para navegar. */
export function SeatStrip() {
  const { table, selectedSeat, selectSeat, pres } = useGame();
  const ordered = [...table.seats].sort((a, b) => visualColumn(a.index) - visualColumn(b.index));
  return (
    <div className="seatstrip" role="tablist" aria-label="Lugares">
      {ordered.map((s) => {
        const bets = s.bets.main + s.bets.twentyThree + s.bets.pairs + s.bets.buster;
        const turn = table.turn?.seat === s.index && !pres.presenting;
        return (
          <button key={s.index} role="tab" aria-selected={selectedSeat === s.index} aria-label={`Lugar ${s.number}`}
            className={`tab ${selectedSeat === s.index ? 'sel' : ''} ${s.mine ? 'mine' : ''} ${s.playerId ? 'taken' : ''} ${turn ? 'turn' : ''}`}
            onClick={() => selectSeat(s.index)}>
            <b>{s.number}</b>
            <small>{s.playerName ? s.playerName.slice(0, 6) : 'livre'}</small>
            <small className="amt">{bets > 0 ? formatBRL(bets) : ' '}</small>
            {turn && <i className="turn-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** O lugar selecionado em destaque (celular na vertical): cartas grandes e áreas de aposta com fichas. */
export function SeatFocus() {
  const { table, selectedSeat, hasWallet, busy, cmd } = useGame();
  const seat = table.seats[selectedSeat]!;
  const n = seat.number;
  if (!seat.playerId) {
    return (
      <section className="seat focus empty" data-seat={n} aria-label={`Lugar ${n}`}>
        <h3>Lugar {n}</h3>
        <p className="avail">Lugar disponível</p>
        <SeatActions seat={seat} />
        {!seat.canTake && <small>{table.phase !== 'BETTING' ? 'Disponível entre rodadas.' : hasWallet ? 'Indisponível agora.' : 'Faça o buy-in inicial para sentar.'}</small>}
      </section>
    );
  }
  return (
    <section className={`seat focus ${seat.mine ? 'mine' : ''} ${table.turn?.seat === seat.index ? 'turn' : ''}`} data-seat={n} aria-label={`Lugar ${n}`}>
      <header>
        <h3>{seat.playerName} <small>(lugar {n}{seat.mine ? ' · você' : ''})</small></h3>
        <TurnBadge seat={seat} />
      </header>
      <Hands seat={seat} strip showChips />
      <BetSpots seat={seat} />
      {seat.insurance.amount > 0 && <small>Insurance: {formatBRL(seat.insurance.amount)}</small>}
      {seat.canLeave && <button className="ghost small leave" disabled={busy} onClick={() => cmd({ type: 'leave', seat: seat.index })}>Sair do lugar</button>}
    </section>
  );
}
