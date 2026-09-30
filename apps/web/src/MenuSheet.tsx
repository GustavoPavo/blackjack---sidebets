import { formatBRL } from '@bj/engine';
import type { PlayMode } from './api';
import { useGame } from './gameContext';
import { usePrefs } from './prefs';
import { SettingsPanel } from './SettingsPanel';
import { Sheet } from './Sheet';

/** Detalhes e registros em painéis recolhíveis, fora do centro da mesa. */
export function MenuSheet({ mode, onMode, onClose, onStats, onRename, onRules, onRebuy, onRestartTraining, extra }: {
  mode: PlayMode; onMode: (m: PlayMode) => void; onClose: () => void; onStats: () => void;
  onRename: () => void; onRules: () => void; onRebuy: () => void; onRestartTraining: () => void; extra?: React.ReactNode;
}) {
  const { table } = useGame();
  const { prefs, setPrefs } = usePrefs();
  const me = table.me;
  const sandbox = mode !== 'real';
  return (
    <Sheet title="Menu" side="left" onClose={onClose}>
      <p className="muted">Simulação local com créditos fictícios — sem depósito, saque ou dinheiro real. Não é multiplayer online.</p>
      <div className="menu-buttons">
        {!sandbox && <button className="ghost" onClick={onStats}>Estatísticas e histórico</button>}
        {!sandbox && <button className="ghost" onClick={() => { onClose(); onRename(); }}>Editar nome</button>}
        <button className="ghost" onClick={() => { onClose(); onRules(); }}>Regras e pagamentos</button>
        {me?.canRebuy && <button className="ghost" onClick={() => { onClose(); onRebuy(); }}>Rebuy</button>}
        {mode === 'real' && <button className="ghost" onClick={() => onMode('training')}>Modo treino</button>}
        {mode === 'training' && <button className="ghost" onClick={onRestartTraining}>Reiniciar treino</button>}
        {sandbox && <button className="ghost" onClick={() => onMode('real')}>{mode === 'training' ? 'Voltar à mesa real' : 'Sair do tutorial'}</button>}
      </div>
      {mode === 'training' && (
        <label className="opt"><input type="checkbox" checked={prefs.trainingHints} onChange={(e) => setPrefs({ trainingHints: e.target.checked })} /> Dicas de estratégia</label>
      )}
      {extra}
      <details>
        <summary>Configurações</summary>
        <SettingsPanel extra={mode === 'real' && (
          <>
            <label className="opt"><input type="checkbox" checked={prefs.trainingHints} onChange={(e) => setPrefs({ trainingHints: e.target.checked })} /> Dicas de estratégia (modo treino)</label>
            <button className="ghost" onClick={() => onMode('demo')}>Abrir tutorial</button>
          </>
        )} />
      </details>
      {me && me.ledger.length > 0 && (
        <details>
          <summary>Histórico de créditos ({me.ledger.length})</summary>
          <ul className="ledger">
            {me.ledger.map((l) => (
              <li key={l.commandId}>
                {l.type === 'buyIn' ? 'Buy-in' : 'Rebuy'} +{formatBRL(l.amount)} · {new Date(l.at).toLocaleTimeString('pt-BR')} · saldo {formatBRL(l.balanceAfter)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>Registro da mesa</summary>
        <ol className="tablelog">{table.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </details>
    </Sheet>
  );
}
