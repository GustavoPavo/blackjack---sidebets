import { useCallback, useEffect, useState } from 'react';
import { formatBRL, type Action, type BetKind, type TableView } from '@bj/engine';
import { getTable, resetTable, send, type Intent } from './api';
import { CardView } from './CardView';
import { SeatPanel } from './SeatPanel';

const CHIPS = [250, 500, 1000, 2500, 5000, 10000];
const PHASE_LABEL: Record<string, string> = {
  BETTING: 'Apostas abertas', DEALING: 'Distribuição', INSURANCE: 'Oferta de Insurance',
  PLAYER_TURNS: 'Decisões dos jogadores', DEALER_TURN: 'Turno do dealer', SETTLEMENT: 'Liquidação',
};
const ACTION_LABEL: Record<Action, string> = {
  hit: 'Pedir (Hit)', stand: 'Parar (Stand)', double: 'Dobrar (Double)', split: 'Dividir (Split)', surrender: 'Desistir (Surrender)',
};

export function App() {
  const [table, setTable] = useState<TableView | null>(null);
  const [error, setError] = useState('');
  const [chip, setChip] = useState(500);

  useEffect(() => { getTable().then(setTable).catch(() => setError('Não foi possível conectar ao servidor.')); }, []);

  const cmd = useCallback(async (intent: Intent) => {
    try {
      const { result, table } = await send(intent);
      setTable(table);
      setError(result.ok ? '' : result.message);
    } catch {
      setError('Falha de comunicação com o servidor.');
    }
  }, []);

  if (!table) return <main className="app"><p>{error || 'Carregando…'}</p></main>;

  const turnSeat = table.turn ? table.seats[table.turn.seat] : null;

  return (
    <main className="app">
      <header className="top">
        <h1>Blackjack</h1>
        <p className="banner">
          <strong>Simulação local</strong> — os 5 lugares são controlados nesta mesma tela. Não é multiplayer online.
          Créditos fictícios, sem depósito, saque ou dinheiro real.
        </p>
      </header>

      <section className="dealer" aria-label="Dealer">
        <h2>Dealer</h2>
        <div className="cards">{table.dealer.cards.map((c, i) => <CardView key={i} card={c} />)}</div>
        {table.dealer.value && <div className="meta"><b>{table.dealer.value.total}{table.dealer.value.soft ? ' (soft)' : ''}</b>{table.dealer.hasBlackjack ? ' · Blackjack' : ''}</div>}
        <div className="phase">Rodada {table.round} · {PHASE_LABEL[table.phase]}</div>
      </section>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="controls" aria-label="Controles da mesa">
        {table.phase === 'BETTING' && (
          <>
            <div className="chips" role="radiogroup" aria-label="Fichas">
              {CHIPS.map((v) => (
                <button key={v} role="radio" aria-checked={chip === v} className={`chip ${chip === v ? 'sel' : ''}`} onClick={() => setChip(v)}>{formatBRL(v)}</button>
              ))}
            </div>
            <button className="primary" disabled={!table.canDeal} onClick={() => cmd({ type: 'deal' })}>Distribuir</button>
            {!table.canDeal && <small>Confirme as apostas de todos os lugares com aposta (mín. principal {formatBRL(table.rules.minMain)}, side bets {formatBRL(table.rules.minSide)}).</small>}
          </>
        )}
        {table.phase === 'PLAYER_TURNS' && turnSeat && (
          <>
            <div className="turnline">Vez de <b>{turnSeat.player}</b> (lugar {turnSeat.index + 1}){turnSeat.hands.length > 1 ? ` · mão ${table.turn!.hand + 1}` : ''}</div>
            <div className="row wrap">
              {table.legalActions.map((a) => (
                <button key={a} className={a === 'stand' ? 'ghost' : ''} onClick={() => cmd({ type: 'action', seat: turnSeat.index, action: a })}>{ACTION_LABEL[a]}</button>
              ))}
            </div>
          </>
        )}
        {table.phase === 'INSURANCE' && <div>O dealer mostra um Ás. Cada lugar decide sobre o Insurance.</div>}
        {table.phase === 'SETTLEMENT' && (
          <div className="row wrap">
            <button className="primary" onClick={() => cmd({ type: 'nextRound' })}>Nova rodada</button>
          </div>
        )}
      </section>

      <div className="seats">
        {table.seats.map((s) => (
          <SeatPanel key={s.index} seat={s} table={table} chip={chip}
            onBet={(seat: number, kind: BetKind, amount: number) => cmd({ type: 'setBet', seat, kind, amount })}
            onCmd={cmd} />
        ))}
      </div>

      <details className="log">
        <summary>Registro da mesa</summary>
        <ol>{table.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        <button className="ghost" onClick={async () => setTable(await resetTable())}>Reiniciar simulação</button>
      </details>
    </main>
  );
}
