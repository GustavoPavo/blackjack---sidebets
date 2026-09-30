import type { Command, CommandResult, TableView } from '@bj/engine';

type DistOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
/** Intenção do jogador; o `playerId` é acrescentado por `send`. */
export type Intent = DistOmit<Command, 'id' | 'playerId'>;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function getTable(playerId?: string): Promise<TableView> {
  const r = await fetch(playerId ? `/api/table?playerId=${encodeURIComponent(playerId)}` : '/api/table');
  if (!r.ok) throw new Error('Servidor indisponível');
  return r.json();
}

/** O cliente só envia intenções. Cartas, saldos e pagamentos vêm sempre do servidor. */
export async function send(playerId: string, intent: Intent): Promise<{ result: CommandResult; table: TableView }> {
  const r = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: { id: newId(), playerId, ...intent } }),
  });
  return r.json();
}

export async function resetTable(playerId?: string): Promise<TableView> {
  const r = await fetch(playerId ? `/api/reset?playerId=${encodeURIComponent(playerId)}` : '/api/reset', { method: 'POST' });
  return r.json();
}
