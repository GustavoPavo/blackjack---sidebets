import { formatBRL, type BetKind, type SeatView, type TableView } from '@bj/engine';
import { CardView } from './CardView';
import type { Presentation } from './usePresentation';

export const BET_LABEL: Record<BetKind, string> = {
  main: 'Principal', twentyThree: '23+1', pairs: 'Pares', buster: 'Buster Lucky',
};
const STATUS_LABEL: Record<string, string> = {
  playing: '', stood: 'Parou', busted: 'Estourou', surrendered: 'Desistiu', blackjack: 'Blackjack!',
};
const OUTCOME_LABEL: Record<string, string> = {
  win: 'ganhou', lose: 'perdeu', push: 'empate', blackjack: 'blackjack', bust: 'estourou', surrender: 'desistência',
};

interface Props {
  seat: SeatView;
  table: TableView;
  chip: number;
  pres: Presentation;
  busy: boolean;
  hasWallet: boolean;
  onBet: (seat: number, kind: BetKind, amount: number) => void;
  onCmd: (intent: any) => void;
}

const total = (b: Record<BetKind, number>) => b.main + b.twentyThree + b.pairs + b.buster;

/** Um LUGAR da mesa: mostra o ocupante, suas apostas e mãos. Não há carteira nem buy-in aqui. */
export function SeatPanel({ seat, table, chip, pres, busy, hasWallet, onBet, onCmd }: Props) {
  const betting = table.phase === 'BETTING';
  const isTurnSeat = table.turn?.seat === seat.index;
  const n = seat.number;
  const showOutcome = !pres.presenting; // totais e resultados só depois da animação

  if (!seat.playerId) {
    return (
      <section className="seat empty" data-seat={n} aria-label={`Lugar ${n}`}>
        <h3>Lugar {n}</h3>
        <p className="avail">Lugar disponível</p>
        {seat.canTake && <button disabled={busy} onClick={() => onCmd({ type: 'takeSeat', seat: seat.index })}>Sentar aqui</button>}
        {!seat.canTake && betting && <small>{hasWallet ? 'Indisponível agora.' : 'Faça o buy-in inicial (no topo) para sentar.'}</small>}
        {!betting && <small>Disponível entre rodadas.</small>}
      </section>
    );
  }

  return (
    <section className={`seat ${isTurnSeat ? 'turn' : ''} ${seat.mine ? 'mine' : ''}`} data-seat={n} aria-label={`Lugar ${n}`}>
      <header>
        <h3>{seat.playerName} <small>(lugar {n}{seat.mine ? ' · você' : ''})</small></h3>
      </header>

      <div className="hands">
        {seat.hands.length === 0 && <span className="muted">Sem cartas</span>}
        {seat.hands.map((h, i) => (
          <div key={i} className={`hand ${h.active && !pres.presenting ? 'active' : ''} ${showOutcome ? h.status : ''}`} aria-label={`Mão ${i + 1} do lugar ${n}`}>
            <div className="cards">
              {h.cards.map((c, j) => <CardView key={h.cardSeq[j]} card={c} hidden={h.cardSeq[j]! > pres.shownSeq} />)}
            </div>
            {showOutcome && (
              <div className="meta">
                <b>{h.value.total}{h.value.soft ? ' (soft)' : ''}</b> · {formatBRL(h.bet)}
                {STATUS_LABEL[h.status] && <em> {STATUS_LABEL[h.status]}</em>}
                {h.doubled && <em> Double</em>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bets">
        {(['main', 'twentyThree', 'pairs', 'buster'] as BetKind[]).map((k) => {
          const blocked = busy || !seat.canEditBets || (k !== 'main' && seat.bets.main <= 0);
          return (
            <div key={k} className={`bet ${k}`}>
              <button
                className="betbtn"
                disabled={blocked}
                title={k !== 'main' && seat.bets.main <= 0 ? 'Faça a aposta principal primeiro' : `Adicionar ${formatBRL(chip)}`}
                onClick={() => onBet(seat.index, k, seat.bets[k] + chip)}
              >
                <span>{BET_LABEL[k]}</span>
                <b>{formatBRL(seat.bets[k])}</b>
              </button>
              {seat.bets[k] > 0 && seat.canEditBets && (
                <button className="x" disabled={busy} aria-label={`Remover aposta ${BET_LABEL[k]} do lugar ${n}`} onClick={() => onBet(seat.index, k, 0)}>✕</button>
              )}
            </div>
          );
        })}
      </div>

      {betting && seat.mine && (
        <div className="row wrap">
          {seat.canRepeat && seat.lastBets && (
            <>
              <button disabled={busy} title={`Repor ${formatBRL(total(seat.lastBets))}`} onClick={() => onCmd({ type: 'repeatBets', seat: seat.index, multiplier: 1 })}>Repetir aposta</button>
              <button disabled={busy} title={`Repor ${formatBRL(total(seat.lastBets) * 2)}`} onClick={() => onCmd({ type: 'repeatBets', seat: seat.index, multiplier: 2 })}>X2</button>
            </>
          )}
          {seat.canEditBets && <button className="ghost" disabled={busy} onClick={() => onCmd({ type: 'clearBets', seat: seat.index })}>Limpar</button>}
          {seat.canConfirm && <button disabled={busy} onClick={() => onCmd({ type: 'confirmBets', seat: seat.index })}>Confirmar apostas</button>}
          {seat.confirmed && <><span className="ok">Apostas confirmadas</span><button className="ghost" disabled={busy} onClick={() => onCmd({ type: 'editBets', seat: seat.index })}>Editar</button></>}
          {seat.canLeave && <button className="ghost" disabled={busy} onClick={() => onCmd({ type: 'leave', seat: seat.index })}>Sair do lugar</button>}
        </div>
      )}

      {table.phase === 'INSURANCE' && seat.mine && seat.insurance.decision === 'pending' && !pres.presenting && (
        <div className="row wrap">
          <button disabled={busy} onClick={() => onCmd({ type: 'insurance', seat: seat.index, take: true })}>Insurance {formatBRL(seat.bets.main / 2)}</button>
          <button className="ghost" disabled={busy} onClick={() => onCmd({ type: 'insurance', seat: seat.index, take: false })}>Recusar</button>
        </div>
      )}
      {seat.insurance.amount > 0 && <small>Insurance: {formatBRL(seat.insurance.amount)}</small>}

      {showOutcome && seat.results.length > 0 && (
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
