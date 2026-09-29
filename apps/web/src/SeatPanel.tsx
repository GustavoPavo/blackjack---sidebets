import { useState } from 'react';
import { formatBRL, type BetKind, type SeatView, type TableView } from '@bj/engine';
import { CardView } from './CardView';

const BET_LABEL: Record<BetKind, string> = {
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
  onBet: (seat: number, kind: BetKind, amount: number) => void;
  onCmd: (intent: any) => void;
}

function AmountForm({ max, label, onSubmit, onCancel, withName }: {
  max: number; label: string; withName?: boolean; onCancel: () => void;
  onSubmit: (cents: number, name?: string) => void;
}) {
  const [text, setText] = useState('1000');
  const [name, setName] = useState('');
  const reais = Number(text.replace(',', '.'));
  const cents = Math.round(reais * 100);
  const invalid = !Number.isFinite(reais) || cents <= 0 ? 'Informe um valor positivo.' : cents > max ? `Máximo ${formatBRL(max)} por operação.` : '';
  return (
    <form className="amount-form" onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit(cents, name); }}>
      {withName && <input aria-label="Nome" placeholder="Nome (opcional)" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />}
      <label>
        Valor (R$)
        <input aria-label="Valor em reais" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {invalid && <small className="err" role="alert">{invalid}</small>}
      <div className="row">
        <button type="submit" disabled={!!invalid}>{label}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export function SeatPanel({ seat, table, chip, onBet, onCmd }: Props) {
  const [form, setForm] = useState<'buyin' | 'rebuy' | null>(null);
  const betting = table.phase === 'BETTING';
  const isTurnSeat = table.turn?.seat === seat.index;
  const n = seat.index + 1;

  if (!seat.player) {
    return (
      <section className="seat empty" aria-label={`Lugar ${n}`}>
        <h3>Lugar {n}</h3>
        <p className="avail">Lugar disponível</p>
        {seat.canBuyIn && form !== 'buyin' && <button onClick={() => setForm('buyin')}>Sentar (buy-in)</button>}
        {seat.canBuyIn && form === 'buyin' && (
          <AmountForm withName max={table.rules.maxBuy} label="Confirmar buy-in" onCancel={() => setForm(null)}
            onSubmit={(amount, name) => { onCmd({ type: 'buyIn', seat: seat.index, amount, name }); setForm(null); }} />
        )}
        {!seat.canBuyIn && <small>Buy-in disponível entre rodadas.</small>}
      </section>
    );
  }

  return (
    <section className={`seat ${isTurnSeat ? 'turn' : ''}`} aria-label={`Lugar ${n}`}>
      <header>
        <h3>{seat.player} <small>(lugar {n})</small></h3>
        <div className="balance" aria-label={`Saldo do lugar ${n}`}>{formatBRL(seat.balance)}</div>
      </header>

      <div className="hands">
        {seat.hands.length === 0 && <span className="muted">Sem cartas</span>}
        {seat.hands.map((h, i) => (
          <div key={i} className={`hand ${h.active ? 'active' : ''} ${h.status}`}>
            <div className="cards">{h.cards.map((c, j) => <CardView key={j} card={c} />)}</div>
            <div className="meta">
              <b>{h.value.total}{h.value.soft ? ' (soft)' : ''}</b> · {formatBRL(h.bet)}
              {STATUS_LABEL[h.status] && <em> {STATUS_LABEL[h.status]}</em>}
              {h.doubled && <em> Double</em>}
            </div>
          </div>
        ))}
      </div>

      <div className="bets">
        {(['main', 'twentyThree', 'pairs', 'buster'] as BetKind[]).map((k) => {
          const blocked = !seat.canEditBets || (k !== 'main' && seat.bets.main <= 0);
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
                <button className="x" aria-label={`Remover aposta ${BET_LABEL[k]}`} onClick={() => onBet(seat.index, k, 0)}>✕</button>
              )}
            </div>
          );
        })}
      </div>

      {betting && (
        <div className="row wrap">
          {seat.canEditBets && <button className="ghost" onClick={() => onCmd({ type: 'clearBets', seat: seat.index })}>Limpar</button>}
          {seat.canConfirm && <button onClick={() => onCmd({ type: 'confirmBets', seat: seat.index })}>Confirmar apostas</button>}
          {seat.confirmed && <><span className="ok">Apostas confirmadas</span><button className="ghost" onClick={() => onCmd({ type: 'editBets', seat: seat.index })}>Editar</button></>}
          {seat.canRebuy && form !== 'rebuy' && <button className="ghost" onClick={() => setForm('rebuy')}>Rebuy</button>}
          {seat.canEditBets && <button className="ghost" onClick={() => onCmd({ type: 'leave', seat: seat.index })}>Sair do lugar</button>}
        </div>
      )}
      {form === 'rebuy' && seat.canRebuy && (
        <AmountForm max={table.rules.maxBuy} label="Confirmar rebuy" onCancel={() => setForm(null)}
          onSubmit={(amount) => { onCmd({ type: 'rebuy', seat: seat.index, amount }); setForm(null); }} />
      )}

      {table.phase === 'INSURANCE' && seat.insurance.decision === 'pending' && (
        <div className="row wrap">
          <button onClick={() => onCmd({ type: 'insurance', seat: seat.index, take: true })}>Insurance {formatBRL(seat.bets.main / 2)}</button>
          <button className="ghost" onClick={() => onCmd({ type: 'insurance', seat: seat.index, take: false })}>Recusar</button>
        </div>
      )}
      {seat.insurance.amount > 0 && <small>Insurance: {formatBRL(seat.insurance.amount)}</small>}

      {seat.results.length > 0 && (
        <ul className="results" aria-label={`Resultados do lugar ${n}`}>
          {seat.results.map((r, i) => (
            <li key={i} className={r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}>
              {BET_LABEL[r.kind as BetKind] ?? 'Insurance'}{r.handIndex !== undefined && seat.hands.length > 1 ? ` (mão ${r.handIndex + 1})` : ''}: {OUTCOME_LABEL[r.outcome]} — {r.label} · {r.net >= 0 ? '+' : ''}{formatBRL(r.net)}
            </li>
          ))}
        </ul>
      )}

      <details className="ledger">
        <summary>Histórico de créditos ({seat.ledger.length})</summary>
        <ul>
          {seat.ledger.map((l) => (
            <li key={l.commandId}>
              {l.type === 'buyIn' ? 'Buy-in' : 'Rebuy'} +{formatBRL(l.amount)} · {new Date(l.at).toLocaleTimeString('pt-BR')} · saldo {formatBRL(l.balanceAfter)}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
