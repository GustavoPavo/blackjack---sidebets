import type { Command, CommandResult, PlayerStats, Preferences, RoundHistoryEntry, TableView } from '@bj/engine';
import { apiUrl } from './config';

type DistOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
/** Intenção do jogador; o servidor acrescenta o jogador a partir da sessão. */
export type Intent = DistOmit<Command, 'id' | 'playerId'>;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
/** Sem conexão com o servidor (falha de rede, não uma resposta de erro). */
export class NetworkError extends Error {
  constructor() { super('Sem conexão com o servidor.'); }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const RETRY_DELAYS = [400, 1200, 2500];
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chamada HTTP com repetição em falhas de REDE. Como o corpo (e o id do comando) é o mesmo em todas as
 * tentativas, o servidor reconhece a repetição e nunca aplica a mesma ação duas vezes.
 */
async function request(method: string, path: string, opts: { token?: string; body?: unknown; retry?: boolean } = {}): Promise<{ status: number; data: any }> {
  const attempts = opts.retry === false ? 1 : RETRY_DELAYS.length + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(apiUrl(path), {
        method,
        headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON (ex.: página de erro de proxy) */ }
      if (r.status === 401) throw new ApiError(401, data?.error?.code ?? 'AUTH', data?.error?.message ?? 'Sessão inválida.');
      if (r.status >= 500 || (r.status >= 400 && r.status !== 422 && !data)) throw new ApiError(r.status, data?.error?.code ?? 'SERVER', data?.error?.message ?? 'Erro no servidor.');
      return { status: r.status, data };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (i === attempts - 1) throw new NetworkError();
      await sleep(RETRY_DELAYS[i]!);
    }
  }
  throw new NetworkError();
}

const okOrThrow = ({ status, data }: { status: number; data: any }) => {
  if (status >= 400) throw new ApiError(status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Erro.');
  return data;
};

export async function createGuest(name: string): Promise<{ token: string; playerId: string; table: TableView }> {
  return okOrThrow(await request('POST', '/api/guest', { body: { name }, retry: false }));
}
export async function getTable(token?: string): Promise<TableView> {
  return okOrThrow(await request('GET', '/api/table', { token }));
}
/** O cliente só envia intenções. Cartas, saldos e pagamentos vêm sempre do servidor. */
export async function send(token: string, intent: Intent, id: string = newId()): Promise<{ result: CommandResult; table: TableView }> {
  const { data } = await request('POST', '/api/commands', { token, body: { command: { id, ...intent } } });
  return data;
}
export async function getPreferences(token: string): Promise<Preferences> { return okOrThrow(await request('GET', '/api/preferences', { token })); }
export async function putPreferences(token: string, patch: Partial<Preferences>): Promise<Preferences> { return okOrThrow(await request('PUT', '/api/preferences', { token, body: patch })); }
export async function getStats(token: string): Promise<PlayerStats> { return okOrThrow(await request('GET', '/api/stats', { token })); }
export async function getHistory(token: string, limit = 20): Promise<RoundHistoryEntry[]> { return okOrThrow(await request('GET', `/api/history?limit=${limit}`, { token })); }
export async function getServerConfig(): Promise<{ devTools: boolean }> { return okOrThrow(await request('GET', '/api/config', { retry: false })); }
export async function cancelRoundDev(token: string): Promise<void> { okOrThrow(await request('POST', '/api/dev/cancel-round', { token, retry: false })); }
