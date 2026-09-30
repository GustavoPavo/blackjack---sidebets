import { formatBRL, type Action } from '@bj/engine';
import { CHIP_VALUES } from './chips';
import { feedback } from './feedback';
import { useGame } from './gameContext';
import { InsuranceActions, SeatActions } from './SeatControls';

const ACTION_LABEL: Record<Action, string> = {
  hit: 'Pedir (Hit)', stand: 'Parar (Stand)', double: 'Dobrar (Double)', split: 'Dividir (Split)', surrender: 'Desistir (Surrender)',
};

/** Fichas circulares, uma cor por valor, com o valor impresso; a selecionada fica em destaque. */
export function ChipTray() {
  const { chip, setChip } = useGame();
  return (
    <div className="chips" role="radiogroup" aria-label="Fichas">
      {CHIP_VALUES.map((v) => (
        <button key={v} role="radio" aria-checked={chip === v} aria-label={`Ficha ${formatBRL(v)}`}
          className={`chip chip-${v} ${chip === v ? 'sel' : ''}`} onClick={() => { setChip(v); feedback.tap(); }}>
          <span>{formatBRL(v)}</span>
        </button>
      ))}
    </div>
  );
}

function TurnActions() {
  const { table, busy, cmd } = useGame();
  const turnSeat = table.turn ? table.seats[table.turn.seat] : null;
  if (!turnSeat) return null;
  return (
    <>
      <div className="turnline">Vez de <b>{turnSeat.playerName}</b> (lugar {turnSeat.number}){turnSeat.hands.length > 1 ? ` · mão ${table.turn!.hand + 1} de ${turnSeat.hands.length}` : ''}</div>
      {turnSeat.mine ? (
        <div className="actions">
          {table.legalActions.map((a) => (
            <button key={a} disabled={busy} className={`act act-${a} ${a === 'stand' ? 'ghost' : ''}`}
              onClick={() => cmd({ type: 'action', seat: turnSeat.index, action: a })}>{ACTION_LABEL[a]}</button>
          ))}
        </div>
      ) : <small>Aguardando {turnSeat.playerName}.</small>}
    </>
  );
}

/**
 * Controles da mesa. `bar`: versão da barra inferior (celular), que age sobre o lugar selecionado;
 * no desktop os botões do lugar ficam dentro do próprio lugar.
 */
export function ControlsBody({ bar }: { bar?: boolean }) {
  const { table, pres, busy, cmd, selectedSeat, layout } = useGame();
  const sel = table.seats[selectedSeat]!;
  const presenting = pres.presenting && table.phase !== 'BETTING';
  return (
    <>
      {table.phase === 'BETTING' && (
        <>
          <ChipTray />
          {bar && <SeatActions seat={sel} withLeave={layout !== 'focus'} />}
          <button className="primary deal" disabled={!table.canDeal || busy || pres.presenting} onClick={() => cmd({ type: 'deal' })}>Distribuir</button>
          {!table.canDeal && !bar && <small>Confirme as apostas de todos os lugares com aposta (mín. principal {formatBRL(table.rules.minMain)}, side bets {formatBRL(table.rules.minSide)}).</small>}
        </>
      )}
      {presenting && <div className="dealing-message" aria-live="polite">{table.phase === 'SETTLEMENT' ? 'Dealer jogando…' : 'Distribuindo…'}</div>}
      {!presenting && table.phase === 'PLAYER_TURNS' && <TurnActions />}
      {!presenting && table.phase === 'INSURANCE' && (
        <>
          <div>O dealer mostra um Ás. Cada lugar decide sobre o Insurance.</div>
          {bar && table.seats.filter((s) => s.mine && s.insurance.decision === 'pending').map((s) => (
            <div key={s.index} className="insurance-row"><small>Lugar {s.number}</small><InsuranceActions seat={s} /></div>
          ))}
        </>
      )}
      {!presenting && table.phase === 'SETTLEMENT' && (
        <div className="row wrap"><button className="primary" disabled={busy} onClick={() => cmd({ type: 'nextRound' })}>Nova rodada</button></div>
      )}
    </>
  );
}
