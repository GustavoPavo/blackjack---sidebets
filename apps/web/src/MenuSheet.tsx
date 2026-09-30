import { formatBRL } from '@bj/engine';
import { useGame } from './gameContext';
import { SettingsPanel } from './SettingsPanel';
import { Sheet } from './Sheet';

/** Detalhes e registros em painéis recolhíveis, fora do centro da mesa. */
export function MenuSheet({ onClose, onRename, onRules, onRebuy, extra }: {
  onClose: () => void; onRename: () => void; onRules: () => void; onRebuy: () => void; extra?: React.ReactNode;
}) {
  const { table } = useGame();
  const me = table.me;
  return (
    <Sheet title="Menu" side="left" onClose={onClose}>
      <p className="muted">Simulação local com créditos fictícios — sem depósito, saque ou dinheiro real. Não é multiplayer online.</p>
      <div className="menu-buttons">
        <button className="ghost" onClick={() => { onClose(); onRename(); }}>Editar nome</button>
        <button className="ghost" onClick={() => { onClose(); onRules(); }}>Regras e pagamentos</button>
        {me?.canRebuy && <button className="ghost" onClick={() => { onClose(); onRebuy(); }}>Rebuy</button>}
      </div>
      {extra}
      <details>
        <summary>Configurações</summary>
        <SettingsPanel />
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
