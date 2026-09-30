import { formatBRL, type BetKind, type SeatView } from '@bj/engine';
import { BetSpot } from './ChipStack';
import { useGame } from './gameContext';

export const BET_LABEL: Record<BetKind, string> = {
  main: 'Principal', twentyThree: '23+1', pairs: 'Pares', buster: 'Buster Lucky',
};
const total = (b: Record<BetKind, number>) => b.main + b.twentyThree + b.pairs + b.buster;

/** As 4 áreas de aposta do lugar (principal + 3 side bets), com fichas e valor total. */
export function BetSpots({ seat }: { seat: SeatView }) {
  const { chip, busy, bet, table } = useGame();
  return (
    <div className={`bets ${table.phase === 'BETTING' ? '' : 'playing'}`}>
      {(['main', 'twentyThree', 'pairs', 'buster'] as BetKind[]).map((k) => {
        const sideBlocked = k !== 'main' && seat.bets.main <= 0;
        return (
          <BetSpot key={k} kind={k} label={BET_LABEL[k]} amount={seat.bets[k]}
            disabled={busy || !seat.canEditBets || sideBlocked}
            title={sideBlocked ? 'Faça a aposta principal primeiro' : `Adicionar ${formatBRL(chip)}`}
            onAdd={() => bet(seat.index, k, seat.bets[k] + chip)}
            onRemove={seat.canEditBets ? () => bet(seat.index, k, 0) : undefined}
            removeLabel={`Remover aposta ${BET_LABEL[k]} do lugar ${seat.number}`} />
        );
      })}
    </div>
  );
}

/** Botões do lugar na fase de apostas: sentar, repetir, X2, limpar, confirmar, editar, sair. */
export function SeatActions({ seat, withLeave = true }: { seat: SeatView; withLeave?: boolean }) {
  const { table, busy, cmd } = useGame();
  if (table.phase !== 'BETTING') return null;
  if (!seat.playerId) {
    return seat.canTake ? <div className="row wrap"><button disabled={busy} onClick={() => cmd({ type: 'takeSeat', seat: seat.index })}>Sentar aqui</button></div> : null;
  }
  if (!seat.mine) return null;
  return (
    <div className="row wrap seat-actions">
      {seat.canRepeat && seat.lastBets && (
        <>
          <button disabled={busy} title={`Repor ${formatBRL(total(seat.lastBets))}`} onClick={() => cmd({ type: 'repeatBets', seat: seat.index, multiplier: 1 })}>Repetir aposta</button>
          <button disabled={busy} title={`Repor ${formatBRL(total(seat.lastBets) * 2)}`} onClick={() => cmd({ type: 'repeatBets', seat: seat.index, multiplier: 2 })}>X2</button>
        </>
      )}
      {seat.canEditBets && <button className="ghost" disabled={busy} onClick={() => cmd({ type: 'clearBets', seat: seat.index })}>Limpar</button>}
      {seat.canConfirm && <button className="btn-confirm" disabled={busy} onClick={() => cmd({ type: 'confirmBets', seat: seat.index })}>Confirmar apostas</button>}
      {seat.confirmed && <><span className="ok">Apostas confirmadas</span><button className="ghost" disabled={busy} onClick={() => cmd({ type: 'editBets', seat: seat.index })}>Editar</button></>}
      {withLeave && seat.canLeave && <button className="ghost" disabled={busy} onClick={() => cmd({ type: 'leave', seat: seat.index })}>Sair do lugar</button>}
    </div>
  );
}

/** Insurance pendente do lugar. */
export function InsuranceActions({ seat }: { seat: SeatView }) {
  const { table, busy, cmd, pres } = useGame();
  if (table.phase !== 'INSURANCE' || !seat.mine || seat.insurance.decision !== 'pending' || pres.presenting) return null;
  return (
    <div className="row wrap">
      <button disabled={busy} onClick={() => cmd({ type: 'insurance', seat: seat.index, take: true })}>Insurance {formatBRL(seat.bets.main / 2)}</button>
      <button className="ghost" disabled={busy} onClick={() => cmd({ type: 'insurance', seat: seat.index, take: false })}>Recusar</button>
    </div>
  );
}
