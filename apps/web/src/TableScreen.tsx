import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatBRL, type BetKind, type TableView } from '@bj/engine';
import { AmountForm } from './AmountForm';
import { ApiError, NetworkError, cancelRoundDev, getServerConfig, getTable, send, startSandbox, type Intent, type PlayMode } from './api';
import { ConnectionBanner } from './ConnectionBanner';
import { ControlsBody } from './Controls';
import { Dealer } from './Dealer';
import { feedback, setFeedbackPrefs } from './feedback';
import { GameContext, type Game } from './gameContext';
import { visualColumn } from './layout';
import { MenuSheet } from './MenuSheet';
import { onResume } from './native';
import { NameForm } from './NameForm';
import { usePrefs } from './prefs';
import { RoundMessage } from './RoundMessage';
import { RulesModal } from './RulesModal';
import { SeatFocus, SeatStrip } from './SeatFocus';
import { SeatPanel } from './SeatPanel';
import { Sheet } from './Sheet';
import { StatsSheet } from './StatsSheet';
import { TopBar } from './TopBar';
import { TutorialCoach } from './Tutorial';
import { tutorialStep } from './tutorial';
import { useConnectivity } from './useConnectivity';
import { useLayoutMode } from './useMediaQuery';
import { timingFor, usePresentation } from './usePresentation';

const PHASE_LABEL: Record<string, string> = {
  BETTING: 'Apostas abertas', DEALING: 'Distribuição', INSURANCE: 'Oferta de Insurance',
  PLAYER_TURNS: 'Decisões dos jogadores', DEALER_TURN: 'Turno do dealer', SETTLEMENT: 'Liquidação',
};

type SheetKind = 'menu' | 'rename' | 'buyin' | 'rebuy' | 'rules' | 'stats' | 'tutorialOffer' | null;

export function TableScreen({ token, name, mode, onMode, onIdentity, onSessionLost }: {
  token: string; name: string; mode: PlayMode; onMode: (m: PlayMode) => void;
  onIdentity: (id: { id: string; name: string }) => void;
  onSessionLost: () => void;
}) {
  const [table, setTable] = useState<TableView | null>(null);
  const [error, setError] = useState('');
  const [chip, setChipState] = useState(500);
  const [chipTouched, setChipTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [devTools, setDevTools] = useState(false);
  const [linkLost, setLinkLost] = useState(false);
  const online = useConnectivity();
  const offline = !online || linkLost;
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const { prefs, setPrefs, reducedMotion, ready } = usePrefs();
  const layout = useLayoutMode();
  const sandbox = mode !== 'real';

  setFeedbackPrefs(prefs);
  const timing = timingFor(prefs.animationSpeed, reducedMotion);
  const pres = usePresentation(table, timing, () => feedback.card());
  const rootRef = useRef<HTMLDivElement>(null);
  const presRef = useRef(pres);
  presRef.current = pres;
  const busyRef = useRef(false);
  const shownBalance = useRef<number | null>(null);
  const initialSelect = useRef(true);

  const onApiError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { onSessionLost(); return; }
    setError('Falha de comunicação com o servidor.');
  }, [onSessionLost]);

  const cmd = useCallback(async (intent: Intent) => {
    if (busyRef.current) return;
    if (offlineRef.current) { setError('Sem conexão com o servidor.'); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const { result, table } = await send(token, intent, undefined, mode);
      setTable(table);
      setError(result.ok ? '' : result.message);
      if (result.ok) {
        if (intent.type === 'setName' && table.me && !sandbox) onIdentity({ id: table.me.id, name: table.me.name });
        if (intent.type === 'takeSeat') setSelectedSeat(intent.seat);
        if ((intent.type === 'setBet' && intent.amount > 0) || intent.type === 'repeatBets') feedback.chip();
      }
    } catch (e) {
      if (e instanceof NetworkError) {
        // A ação pode ou não ter chegado ao servidor (a repetição automática usa o MESMO id, então nunca duplica).
        // Não reenviamos por conta própria: ao reconectar o estado é consultado no servidor.
        setLinkLost(true);
        setError('Sem conexão. A última ação pode não ter chegado ao servidor; o estado será sincronizado ao reconectar.');
      } else onApiError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [token, mode, sandbox, onApiError, onIdentity]);

  /** Sincroniza com o servidor SEM repetir ações e sem animar (estado final direto). */
  const resync = useCallback(async () => {
    if (busyRef.current) return; // uma ação em andamento já vai atualizar o estado ao terminar
    try {
      const t = await getTable(token, mode);
      setTable(t);
      presRef.current.snap(t);
      setLinkLost(false);
      setError('');
    } catch (e) {
      if (e instanceof NetworkError) setLinkLost(true); else onApiError(e);
    }
  }, [token, mode, onApiError]);

  // Ao voltar do segundo plano ou da falta de conexão: consulta o estado do servidor.
  useEffect(() => onResume(() => { void resync(); }), [resync]);
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void resync();
    wasOnline.current = online;
  }, [online, resync]);
  useEffect(() => {
    if (!linkLost) return;
    const t = setInterval(() => { void resync(); }, 3000);
    return () => clearInterval(t);
  }, [linkLost, resync]);

  // Entrada: mesa real / treino (retoma a sessão) / demonstração (sempre recomeça do zero).
  useEffect(() => {
    (mode === 'demo' ? startSandbox(token, 'demo') : getTable(token, mode)).then(setTable).catch(onApiError);
  }, [token, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getServerConfig().then((c) => setDevTools(c.devTools)).catch(() => {}); }, []);

  // Atualização periódica só na mesa real (outros jogadores), sem interromper a animação.
  useEffect(() => {
    if (sandbox) return;
    const t = setInterval(async () => {
      if (busyRef.current || presRef.current.presenting || offlineRef.current) return;
      try {
        const next = await getTable(token);
        setTable((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch { /* mantém o estado atual */ }
    }, 2500);
    return () => clearInterval(t);
  }, [token, sandbox]);

  // Lugar selecionado (celular): começa no primeiro lugar do jogador e acompanha a vez / o Insurance pendente.
  useEffect(() => {
    if (!table) return;
    if (initialSelect.current) {
      initialSelect.current = false;
      const mine = table.seats.find((s) => s.mine);
      if (mine) setSelectedSeat(mine.index);
    }
    if (table.turn && table.seats[table.turn.seat]!.mine) setSelectedSeat(table.turn.seat);
  }, [table?.turn?.seat, table?.turn?.hand]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pending = table?.phase === 'INSURANCE' ? table.seats.find((s) => s.mine && s.insurance.decision === 'pending') : undefined;
    if (pending) setSelectedSeat(pending.index);
  }, [table?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Som e vibração de vitória, somente depois da apresentação terminar.
  const me = table?.me ?? null;
  const mySummary = table && me ? table.roundSummary.find((s) => s.playerId === me.id) : undefined;
  const winRound = useRef(-1);
  useEffect(() => {
    if (table && mySummary && !pres.presenting && table.phase === 'SETTLEMENT' && mySummary.net > 0 && winRound.current !== table.round) {
      winRound.current = table.round;
      feedback.win();
    }
  }, [table, mySummary, pres.presenting]);

  // Oferta (opcional) do tutorial na primeira vez.
  useEffect(() => {
    if (mode === 'real' && table && ready && !prefs.tutorialSeen && !offerDismissed && sheet === null) setSheet('tutorialOffer');
  }, [mode, table, ready, prefs.tutorialSeen, offerDismissed, sheet]);

  // Reserva, no fim da página, o espaço da barra de controles fixa (celular).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = root?.querySelector('.actionbar') as HTMLElement | null;
    if (!root || !bar) { root?.style.setProperty('--bar-h', '0px'); return; }
    const apply = () => root.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  });

  if (!table) return <main className="app gate"><p>{error || 'Carregando…'}</p></main>;

  if (!pres.presenting || shownBalance.current === null) shownBalance.current = me?.balance ?? 0;
  const balance = shownBalance.current;
  const hasWallet = !!me && me.ledger.length > 0;
  const fly = !reducedMotion;
  const tut = mode === 'demo' ? tutorialStep(table, chipTouched) : null;

  const game: Game = {
    table, pres, chip, busy: busy || offline, cmd, hasWallet, fly, layout, selectedSeat,
    setChip: (v: number) => { setChipState(v); setChipTouched(true); },
    selectSeat: setSelectedSeat,
    bet: (seat: number, kind: BetKind, amount: number) => cmd({ type: 'setBet', seat, kind, amount }),
  };
  const floating = layout !== 'table';
  const phaseText = pres.presenting && table.phase !== 'BETTING' ? (table.phase === 'SETTLEMENT' ? 'Turno do dealer' : 'Distribuindo cartas…') : PHASE_LABEL[table.phase];
  const close = () => setSheet(null);
  const leaveSandbox = () => onMode('real');
  const finishTutorial = () => { setPrefs({ tutorialSeen: true }); onMode('real'); };
  const restartTutorial = async () => {
    setChipTouched(false);
    try { setTable(await startSandbox(token, 'demo')); } catch (e) { onApiError(e); }
  };
  const restartTraining = async () => { try { setTable(await startSandbox(token, 'training')); close(); } catch (e) { onApiError(e); } };

  const seats = (compact: boolean) => (
    <div className="seats">
      {table.seats.map((s) => (
        <div key={s.index} className="seatslot" style={{ gridColumn: visualColumn(s.index), gridRow: 1, order: visualColumn(s.index) }} data-seat-slot={s.number}>
          <SeatPanel seat={s} compact={compact} />
        </div>
      ))}
    </div>
  );

  const coach = tut && (
    <TutorialCoach step={tut} floating={layout === 'compact'} onSkip={finishTutorial} onDone={finishTutorial} onRestart={restartTutorial} />
  );
  const showRoundMessage = table.phase === 'SETTLEMENT' && !pres.presenting && mySummary && !(mode === 'demo' && floating);

  return (
    <GameContext.Provider value={game}>
      <div ref={rootRef} className={`app layout-${layout} ${reducedMotion ? 'reduce-motion' : ''} ${tut ? `tut tut-${tut}` : ''} ${sandbox ? `sandbox-${mode}` : ''}`} data-layout={layout}
        style={{ '--deal-ms': `${Math.max(120, Math.round(timing.stepMs * 0.9))}ms` } as React.CSSProperties}>
        {layout === 'table' && (
          <header className="top">
            <div className="brand">
              <div><span className="eyebrow">MESA PRIVADA · CRÉDITOS FICTÍCIOS</span><h1>Blackjack <span>Club</span></h1></div>
              <button className="rules-trigger ghost" onClick={() => setSheet('rules')}>Regras e pagamentos ↗</button>
            </div>
            <p className="banner">
              <strong>Simulação local</strong> — mesa de 5 lugares neste servidor. Não é multiplayer online.
              Créditos fictícios, sem depósito, saque ou dinheiro real.
            </p>
          </header>
        )}

        <TopBar balance={balance} name={me?.name ?? name} showRules={layout !== 'table'} canRename={!sandbox} hideCredits={mode === 'demo'}
          walletLabel={mode === 'training' ? 'Saldo de treino' : mode === 'demo' ? 'Saldo de demonstração' : 'Saldo disponível'}
          onMenu={() => setSheet('menu')} onRules={() => setSheet('rules')} onRename={() => setSheet('rename')}
          onBuyIn={() => setSheet('buyin')} onRebuy={() => setSheet('rebuy')} />

        {offline && <ConnectionBanner online={online} />}
        {sandbox && (
          <div className="sandbox-banner" role="status">
            <span>{mode === 'training'
              ? <><b>MODO TREINO</b><span className="long"> — créditos de treino; seu saldo, histórico e estatísticas reais não são afetados.</span></>
              : <><b>TUTORIAL</b><span className="long"> — sessão de demonstração; seu saldo e histórico reais não são afetados.</span></>}</span>
            <button className="ghost small" onClick={leaveSandbox}>{mode === 'training' ? 'Voltar à mesa real' : 'Sair do tutorial'}</button>
          </div>
        )}

        {layout === 'focus' && coach}

        <div className="table-surface">
          <div className="table-rim">
            <Dealer />
            {layout === 'table' && <div className="table-mark"><span>BLACKJACK PAGA 3:2</span><small>DEALER PARA NO SOFT 17 · INSURANCE PAGA 2:1</small></div>}
            {/* Visão do jogador: lugar 1 à direita … lugar 5 à esquerda (colunas da grade). */}
            {layout === 'table' && seats(false)}
            {layout === 'compact' && seats(true)}
            {layout === 'focus' && <><SeatStrip /><SeatFocus /></>}
          </div>
        </div>

        <div className="phase-line">Rodada {table.round} · {phaseText}</div>
        {error && <div className="error" role="alert">{error}</div>}
        {layout !== 'focus' && coach}
        {showRoundMessage && <RoundMessage summary={mySummary} floating={floating} />}

        {layout === 'table'
          ? <section className="controls" aria-label="Controles da mesa"><ControlsBody /></section>
          : <section className="actionbar" aria-label="Controles da mesa"><ControlsBody bar /></section>}

        {sheet === 'menu' && (
          <MenuSheet mode={mode} onMode={(m) => { close(); onMode(m); }} onClose={close} onStats={() => setSheet('stats')}
            onRename={() => setSheet('rename')} onRules={() => setSheet('rules')} onRebuy={() => setSheet('rebuy')} onRestartTraining={restartTraining}
            extra={devTools && !sandbox ? <button className="ghost" onClick={async () => { await cancelRoundDev(token).catch(() => {}); setTable(await getTable(token)); close(); }}>Cancelar rodada (dev)</button> : null} />
        )}
        {sheet === 'rename' && (
          <Sheet title="Editar nome" onClose={close}>
            <NameForm initial={me?.name ?? name} submitLabel="Salvar nome" onCancel={close} onSubmit={(n) => { close(); cmd({ type: 'setName', name: n }); }} />
          </Sheet>
        )}
        {sheet === 'buyin' && me?.canBuyIn && (
          <Sheet title="Buy-in de créditos fictícios" onClose={close}>
            <p className="muted">Créditos fictícios (máx. {formatBRL(table.rules.maxBuy)} por operação). Sem cobrança nem dinheiro real.</p>
            <AmountForm max={table.rules.maxBuy} label="Confirmar buy-in" onCancel={close} onSubmit={(amount) => { close(); cmd({ type: 'buyIn', amount }); }} />
          </Sheet>
        )}
        {sheet === 'rebuy' && me?.canRebuy && (
          <Sheet title="Rebuy de créditos fictícios" onClose={close}>
            <p className="muted">Créditos fictícios (máx. {formatBRL(table.rules.maxBuy)} por operação), entre rodadas e antes de confirmar apostas.</p>
            <AmountForm max={table.rules.maxBuy} label="Confirmar rebuy" onCancel={close} onSubmit={(amount) => { close(); cmd({ type: 'rebuy', amount }); }} />
          </Sheet>
        )}
        {sheet === 'stats' && <StatsSheet token={token} onClose={close} />}
        {sheet === 'rules' && <RulesModal onClose={close} />}
        {sheet === 'tutorialOffer' && (
          <Sheet title="Tutorial rápido" onClose={() => { setOfferDismissed(true); setPrefs({ tutorialSeen: true }); close(); }}>
            <p>Quer aprender a jogar em cerca de um minuto? É opcional, acontece numa sessão de demonstração com créditos de demonstração e <b>não altera seu saldo nem seu histórico</b>. Você pode abrir o tutorial depois em Menu → Configurações.</p>
            <div className="row wrap">
              <button onClick={() => { setOfferDismissed(true); close(); onMode('demo'); }}>Começar tutorial</button>
              <button className="ghost" onClick={() => { setOfferDismissed(true); setPrefs({ tutorialSeen: true }); close(); }}>Pular</button>
            </div>
          </Sheet>
        )}
      </div>
    </GameContext.Provider>
  );
}
