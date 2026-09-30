import { useEffect, useState } from 'react';
import { formatBRL, type BetKind, type PlayerStats, type RoundHistoryEntry } from '@bj/engine';
import { getHistory, getStats } from './api';
import { CardView } from './CardView';
import { BET_LABEL } from './SeatControls';
import { Sheet } from './Sheet';

const KIND_LABEL: Record<string, string> = { ...BET_LABEL, insurance: 'Insurance' };
const KIND_ORDER = ['main', 'twentyThree', 'pairs', 'buster', 'insurance'] as const;
const OUTCOME_LABEL: Record<string, string> = { win: 'ganhou', lose: 'perdeu', push: 'empate', blackjack: 'blackjack', bust: 'estourou', surrender: 'desistência' };

export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatBRL(Math.abs(n))}`;
const cls = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
/** Taxa de vitória = vitórias ÷ mãos principais jogadas (cada mão de split conta; empate/desistência/estouro não são vitória). */
export const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

export function StatsSheet({ token, onClose }: { token: string; onClose: () => void }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([getStats(token), getHistory(token, 20)])
      .then(([s, h]) => { if (alive) { setStats(s); setHistory(h); } })
      .catch(() => { if (alive) setError('Não foi possível carregar as estatísticas.'); });
    return () => { alive = false; };
  }, [token]);

  return (
    <Sheet title="Estatísticas e histórico" onClose={onClose} wide>
      {error && <p className="err" role="alert">{error}</p>}
      {!stats && !error && <p className="muted">Carregando…</p>}
      {stats && (
        <>
          <dl className="stat-tiles">
            <div><dt>Rodadas</dt><dd>{stats.rounds}</dd></div>
            <div><dt>Mãos jogadas</dt><dd>{stats.hands}</dd></div>
            <div><dt>Vitórias</dt><dd>{stats.wins}</dd></div>
            <div><dt>Derrotas</dt><dd>{stats.losses}</dd></div>
            <div><dt>Empates</dt><dd>{stats.pushes}</dd></div>
            <div><dt>Blackjacks naturais</dt><dd>{stats.naturals}</dd></div>
            <div><dt>Taxa de vitória</dt><dd>{pct(stats.winRate)}</dd></div>
            <div className="wide"><dt>Resultado líquido acumulado</dt><dd className={cls(stats.net)}>{signed(stats.net)}</dd></div>
            <div><dt>Total apostado</dt><dd>{formatBRL(stats.stake)}</dd></div>
            <div><dt>Retorno total</dt><dd>{formatBRL(stats.returned)}</dd></div>
          </dl>
          <p className="muted small-note">
            <b>Taxa de vitória</b> = vitórias ÷ mãos principais jogadas. Empates, desistências e mãos que estouraram contam como não-vitória; cada mão de split conta como uma mão.
            {' '}<b>Retorno total</b> = aposta devolvida + lucro; <b>lucro líquido</b> = retorno total − valor apostado.
            {' '}Buy-in e rebuy ({formatBRL(stats.creditsAdded)} adicionados até agora) <b>não</b> entram no resultado.
          </p>

          <h3>Por tipo de aposta</h3>
          <div className="table-scroll">
            <table className="stat-table">
              <thead><tr><th>Aposta</th><th>Qtde</th><th>Vitórias</th><th>Apostado</th><th>Retorno total</th><th>Lucro líquido</th></tr></thead>
              <tbody>
                {KIND_ORDER.map((k) => {
                  const r = stats.byKind[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{KIND_LABEL[k]}</th><td>{r.count}</td><td>{r.wins}</td><td>{formatBRL(r.stake)}</td><td>{formatBRL(r.returned)}</td>
                      <td className={cls(r.net)}>{signed(r.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3>Últimas rodadas</h3>
          {history && history.length === 0 && <p className="muted">Nenhuma rodada jogada ainda.</p>}
          <ul className="history">
            {history?.map((r) => (
              <li key={r.roundId}>
                <details>
                  <summary>
                    <span>Rodada #{r.roundId} · {new Date(r.settledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <b className={cls(r.net)}>{signed(r.net)}</b>
                  </summary>
                  <div className="hist-dealer"><small>Dealer:</small> <span className="mini-cards">{r.dealer.map((c, i) => <CardView key={i} card={c} fly={false} />)}</span></div>
                  {r.seats.map((s) => (
                    <div key={s.seat} className="hist-seat">
                      <h4>Lugar {s.number} <b className={cls(s.net)}>{signed(s.net)}</b></h4>
                      {s.hands.map((h) => (
                        <div key={h.index} className="hist-hand">
                          <small>Mão {h.index + 1}{h.fromSplit ? ' (split)' : ''}{h.doubled ? ' · Double' : ''} · {formatBRL(h.bet)}</small>
                          <span className="mini-cards">{h.cards.map((c, i) => <CardView key={i} card={c} fly={false} />)}</span>
                        </div>
                      ))}
                      <ul className="hist-results">
                        {s.results.map((x, i) => (
                          <li key={i} className={cls(x.net)}>
                            {KIND_LABEL[x.kind as BetKind | 'insurance']}{x.handIndex !== null && s.hands.length > 1 ? ` (mão ${x.handIndex + 1})` : ''}: {OUTCOME_LABEL[x.outcome]} — {x.label} · {signed(x.net)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
