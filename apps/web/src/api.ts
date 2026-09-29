import type { Command, CommandResult, TableView } from '@bj/engine';

type DistOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
export type Intent = DistOmit<Command, 'id'>;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function getTable(): Promise<TableView> {
  const r = await fetch('/api/table');
  if (!r.ok) throw new Error('Servidor indisponível');
  return r.json();
}

/** O cliente só envia intenções. Cartas, saldos e pagamentos vêm sempre do servidor. */
export async function send(intent: Intent): Promise<{ result: CommandResult; table: TableView }> {
  const r = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: { id: newId(), ...intent } }),
  });
  return r.json();
}

export async function resetTable(): Promise<TableView> {
  const r = await fetch('/api/reset', { method: 'POST' });
  return r.json();
}
