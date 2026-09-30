import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBRL, type Action, type BetKind, type TableView } from '@bj/engine';
import { getTable, resetTable, send, type Intent } from './api';
import { AmountForm } from './AmountForm';
import { CardView } from './CardView';
import { loadIdentity, newPlayerId, saveIdentity, type Identity } from './identity';
import { visualColumn } from './layout';
import { NameForm } from './NameForm';
import { RoundMessage } from './RoundMessage';
import { RulesModal } from './RulesModal';
import { SeatPanel } from './SeatPanel';
import { usePresentation } from './usePresentation';

const CHIPS = [250, 500, 1000, 2500, 5000, 10000];
const PHASE_LABEL: Record<string, string> = {
  BETTING: 'Apostas abertas', DEALING: 'Distribuição', INSURANCE: 'Oferta de Insurance',
  PLAYER_TURNS: 'Decisões dos jogadores', DEALER_TURN: 'Turno do dealer', SETTLEMENT: 'Liquidação',
};
const ACTION_LABEL: Record<Action, string> = {
  hit: 'Pedir (Hit)', stand: 'Parar (Stand)', double: 'Dobrar (Double)', split: 'Dividir (Split)', surrender: 'Desistir (Surrender)',
};

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity());
  const [table, setTable] = useState<TableView | null>(null);
  const [error, setError] = useState('');
  const [chip, setChip] = useState(500);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'name' | 'buyin' | 'rebuy' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const pres = usePresentation(table);
  const presRef = useRef(pres);
  presRef.current = pres;
  const busyRef = useRef(false);
  const shownBalance = useRef<number | null>(null);

  const playerId = identity?.id;

  const cmd = useCallback(async (intent: Intent) => {
    if (!playerId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { result, table } = await send(playerId, intent);
      setTable(table);
      setError(result.ok ? '' : result.message);
    } catch {
      setError('Falha de comunicação com o servidor.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [playerId]);

  // Ao abrir (ou se o servidor foi reiniciado), registra o nome salvo: mesmo id = mesma carteira.
  useEffect(() => {
    if (!identity) return;
    cmd({ type: 'setName', name: identity.name });
  }, [identity?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (identity && table && !table.me && !busyRef.current) cmd({ type: 'setName', name: identity.name });
  }, [table?.me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualização periódica (outros navegadores/jogadores na mesma mesa), sem interromper a animação.
  useEffect(() => {
    if (!playerId) return;
    const t = setInterval(async () => {
      if (busyRef.current || presRef.current.presenting) return;
      try {
        const next = await getTable(playerId);
        setTable((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch { /* mantém o estado atual */ }
    }, 2500);
    return () => clearInterval(t);
  }, [playerId]);

  if (!identity) {
    return (
      <main className="app">
        <div className="modal">
          <NameForm
            title="Bem-vindo ao Blackjack"
            submitLabel="Começar"
            onSubmit={(name) => { const id = { id: newPlayerId(), name }; saveIdentity(id); setIdentity(id); }}
          />
          <p className="muted">Créditos fictícios. Seu nome fica salvo neste navegador.</p>
        </div>
      </main>
    );
  }
  if (!table) return <main className="app"><p>{error || 'Carregando…'}</p></main>;

  const me = table.me;
  if (!(pres.presenting) || shownBalance.current === null) shownBalance.current = me?.balance ?? 0;
  const balance = shownBalance.current;
  const turnSeat = table.turn ? table.seats[table.turn.seat] : null;
  const mySummary = me ? table.roundSummary.find((s) => s.playerId === me.id) : undefined;
  const hasWallet = !!me && me.ledger.length > 0;

  const rename = (name: string) => {
    const next = { id: identity.id, name };
    saveIdentity(next);
    setIdentity(next);
    setPanel(null);
    cmd({ type: 'setName', name });
  };

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <div><span className="eyebrow">MESA PRIVADA · CRÉDITOS FICTÍCIOS</span><h1>Blackjack <span>Club</span></h1></div>
          <button className="rules-trigger ghost" onClick={() => setRulesOpen(true)}>Regras e pagamentos ↗</button>
        </div>
        <p className="banner">
          <strong>Simulação local</strong> — mesa de 5 lugares neste servidor. Não é multiplayer online.
          Créditos fictícios, sem depósito, saque ou dinheiro real.
        </p>
      </header>

      <section className="playerbar" aria-label="Jogador">
        <div className="who">
          <span className="label">Jogador</span> <b data-testid="player-name">{me?.name ?? identity.name}</b>
          <button className="ghost small" onClick={() => setPanel(panel === 'name' ? null : 'name')}>Editar nome</button>
        </div>
        <div className="wallet">
          <span className="label">Saldo disponível</span> <b className="balance" aria-label="Saldo do jogador">{formatBRL(balance)}</b>
        </div>
        <div className="row wrap">
          {me?.canBuyIn && <button disabled={busy} onClick={() => setPanel(panel === 'buyin' ? null : 'buyin')}>Buy-in inicial</button>}
          {me?.canRebuy && <button className="ghost" disabled={busy} onClick={() => setPanel(panel === 'rebuy' ? null : 'rebuy')}>Rebuy</button>}
        </div>
        {me && me.ledger.length > 0 && (
          <details className="ledger">
            <summary>Histórico de créditos ({me.ledger.length})</summary>
            <ul>
              {me.ledger.map((l) => (
                <li key={l.commandId}>
                  {l.type === 'buyIn' ? 'Buy-in' : 'Rebuy'} +{formatBRL(l.amount)} · {new Date(l.at).toLocaleTimeString('pt-BR')} · saldo {formatBRL(l.balanceAfter)}
                </li>
              ))}
            </ul>
          </details>
        )}
        {panel === 'name' && <NameForm initial={me?.name ?? identity.name} submitLabel="Salvar nome" onSubmit={rename} onCancel={() => setPanel(null)} />}
        {panel === 'buyin' && me?.canBuyIn && (
          <AmountForm max={table.rules.maxBuy} label="Confirmar buy-in" onCancel={() => setPanel(null)}
            onSubmit={(amount) => { cmd({ type: 'buyIn', amount }); setPanel(null); }} />
        )}
        {panel === 'rebuy' && me?.canRebuy && (
          <AmountForm max={table.rules.maxBuy} label="Confirmar rebuy" onCancel={() => setPanel(null)}
            onSubmit={(amount) => { cmd({ type: 'rebuy', amount }); setPanel(null); }} />
        )}
      </section>

      <div className="table-surface">
        <div className="table-rim">
          <section className="dealer" aria-label="Dealer">
            <h2>Dealer</h2>
            <div className="cards">
              {table.dealer.cards.map((c, i) => (
                <CardView key={`${table.dealer.cardSeq[i]}-${i === 1 && pres.holeUp}`} card={c}
                  hidden={table.dealer.cardSeq[i]! > pres.shownSeq}
                  faceDown={i === 1 && !pres.holeUp} />
              ))}
            </div>
            {table.dealer.value && !pres.presenting && (
              <div className="meta"><b>{table.dealer.value.total}{table.dealer.value.soft ? ' (soft)' : ''}</b>{table.dealer.hasBlackjack ? ' · Blackjack' : ''}</div>
            )}
          </section>

          <div className="table-mark"><span>BLACKJACK PAGA 3:2</span><small>DEALER PARA NO SOFT 17 · INSURANCE PAGA 2:1</small></div>

          {/* Visão do jogador: lugar 1 à direita … lugar 5 à esquerda (colunas da grade). */}
          <div className="seats">
            {table.seats.map((s) => (
              <div key={s.index} className="seatslot" style={{ gridColumn: visualColumn(s.index), gridRow: 1, order: visualColumn(s.index) }} data-seat-slot={s.number}>
                <SeatPanel seat={s} table={table} chip={chip} pres={pres} busy={busy} hasWallet={hasWallet}
                  onBet={(seat: number, kind: BetKind, amount: number) => cmd({ type: 'setBet', seat, kind, amount })}
                  onCmd={cmd} />
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="phase-line">Rodada {table.round} · {pres.presenting && table.phase !== 'BETTING' ? (table.phase === 'SETTLEMENT' ? 'Turno do dealer' : 'Distribuindo cartas…') : PHASE_LABEL[table.phase]}</div>

      {error && <div className="error" role="alert">{error}</div>}

      {table.phase === 'SETTLEMENT' && !pres.presenting && mySummary && <RoundMessage summary={mySummary} />}

      <section className="controls" aria-label="Controles da mesa">
        {table.phase === 'BETTING' && (
          <>
            <div className="chips" role="radiogroup" aria-label="Fichas">
              {CHIPS.map((v) => (
                <button key={v} role="radio" aria-checked={chip === v} aria-label={`Ficha ${formatBRL(v)}`} className={`chip chip-${v} ${chip === v ? 'sel' : ''}`} onClick={() => setChip(v)}><span>{formatBRL(v)}</span></button>
              ))}
            </div>
            <button className="primary" disabled={!table.canDeal || busy || pres.presenting} onClick={() => cmd({ type: 'deal' })}>Distribuir</button>
            {!table.canDeal && <small>Confirme as apostas de todos os lugares com aposta (mín. principal {formatBRL(table.rules.minMain)}, side bets {formatBRL(table.rules.minSide)}).</small>}
          </>
        )}
        {pres.presenting && table.phase !== 'BETTING' && <div className="dealing-message" aria-live="polite">{table.phase === 'SETTLEMENT' ? 'Dealer jogando…' : 'Distribuindo…'}</div>}
        {!pres.presenting && table.phase === 'PLAYER_TURNS' && turnSeat && (
          <>
            <div className="turnline">Vez de <b>{turnSeat.playerName}</b> (lugar {turnSeat.number}){turnSeat.hands.length > 1 ? ` · mão ${table.turn!.hand + 1}` : ''}</div>
            {turnSeat.mine ? (
              <div className="row wrap">
                {table.legalActions.map((a) => (
                  <button key={a} disabled={busy} className={a === 'stand' ? 'ghost' : ''} onClick={() => cmd({ type: 'action', seat: turnSeat.index, action: a })}>{ACTION_LABEL[a]}</button>
                ))}
              </div>
            ) : <small>Aguardando {turnSeat.playerName}.</small>}
          </>
        )}
        {!pres.presenting && table.phase === 'INSURANCE' && <div>O dealer mostra um Ás. Cada lugar decide sobre o Insurance.</div>}
        {!pres.presenting && table.phase === 'SETTLEMENT' && (
          <div className="row wrap">
            <button className="primary" disabled={busy} onClick={() => cmd({ type: 'nextRound' })}>Nova rodada</button>
          </div>
        )}
      </section>

      <details className="log">
        <summary>Registro da mesa</summary>
        <ol>{table.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        <button className="ghost" onClick={async () => setTable(await resetTable(identity.id))}>Reiniciar simulação</button>
      </details>
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
