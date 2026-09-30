import { formatBRL } from '@bj/engine';
import { useGame } from './gameContext';

/** Nome e saldo disponível numa área compacta e sempre acessível (fixa no topo). */
export function TopBar({ balance, name, onMenu, onRules, onRename, onBuyIn, onRebuy, showRules }: {
  balance: number; name: string; showRules: boolean;
  onMenu: () => void; onRules: () => void; onRename: () => void; onBuyIn: () => void; onRebuy: () => void;
}) {
  const { table, busy } = useGame();
  const me = table.me;
  return (
    <header className="topbar" aria-label="Jogador">
      <button className="icon" aria-label="Menu" onClick={onMenu}>☰</button>
      <div className="who">
        <span className="label">Jogador</span>
        <b className="name" data-testid="player-name">{name}</b>
        <button className="ghost small" aria-label="Editar nome" onClick={onRename}><span className="long">Editar nome</span><span className="short" aria-hidden="true">✎</span></button>
      </div>
      <div className="wallet">
        <span className="label">Saldo disponível</span>
        <b className="balance" aria-label="Saldo do jogador">{formatBRL(balance)}</b>
      </div>
      <div className="topbar-actions">
        {me?.canBuyIn && <button className="cta" disabled={busy} onClick={onBuyIn}>Buy-in inicial</button>}
        {me?.canRebuy && <button className="ghost" disabled={busy} onClick={onRebuy}>Rebuy</button>}
        {showRules && <button className="ghost" aria-label="Regras e pagamentos" onClick={onRules}>Regras</button>}
      </div>
    </header>
  );
}
