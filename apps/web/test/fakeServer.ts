import { DEFAULT_PREFERENCES, Shoe, TUTORIAL_SHOE, Table, parsePreferences, toView, type Command, type PlayerStats, type Preferences, type RoundHistoryEntry } from '@bj/engine';

const card = (code: string) => ({ rank: code.slice(0, -1) as any, suit: code.slice(-1) as any });

/**
 * Servidor falso em memória para os testes da interface: mesma API do backend (token de convidado,
 * comandos, preferências), usando o motor real. Instala-se com `vi.stubGlobal('fetch', fake.fetch)`.
 */
export function createFakeServer(shoe: string[] = ['10S', '10D', '9H', '8C']) {
  const table = new Table({ shoeFactory: () => Shoe.stacked(shoe.map(card)), reshuffleBelow: 0 });
  const tokens = new Map<string, string>();
  const prefs = new Map<string, Preferences>();
  const calls: { method: string; path: string; mode: string | null }[] = [];
  const sandboxes = new Map<string, Table>();
  let stats: PlayerStats | null = null;
  let history: RoundHistoryEntry[] = [];
  let n = 0;
  let offline = false;

  const srv = (cmd: Record<string, unknown>) => table.dispatch({ id: `srv-${++n}`, ...cmd } as Command);
  const tokenFor = (id: string) => `bj_${id.padEnd(43, 'x')}`;
  /** Registra um jogador já com sessão; devolve o token. */
  function addPlayer(id: string, name: string, buyIn = 0) {
    srv({ type: 'setName', playerId: id, name });
    if (buyIn) srv({ type: 'buyIn', playerId: id, amount: buyIn });
    const token = tokenFor(id);
    tokens.set(token, id);
    return token;
  }

  /** Sessão separada de treino/demonstração (espelha o SandboxService do servidor). */
  function sandbox(playerId: string, kind: 'training' | 'demo', reset = false): Table {
    const key = `${playerId}:${kind}`;
    if (reset || !sandboxes.has(key)) {
      const t = new Table({ shoeFactory: () => Shoe.stacked((kind === 'demo' ? [...TUTORIAL_SHOE] : shoe).map(card)), reshuffleBelow: 0 });
      const name = table.players.get(playerId)?.name ?? 'Jogador';
      const r = (c: Record<string, unknown>) => t.dispatch({ id: `init-${c.type}`, playerId, ...c } as Command);
      r({ type: 'setName', name }); r({ type: 'buyIn', amount: kind === 'demo' ? 10_000 : 100_000 }); r({ type: 'takeSeat', seat: 0 });
      sandboxes.set(key, t);
    }
    return sandboxes.get(key)!;
  }
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch');
    const u = new URL(url, 'http://x');
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, path: u.pathname, mode: u.searchParams.get('mode') });
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    const playerId = auth?.startsWith('Bearer ') ? tokens.get(auth.slice(7)) : undefined;
    if (auth && !playerId) return json({ error: { code: 'INVALID_SESSION', message: 'Sessão inválida.' } }, 401);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const mode = u.searchParams.get('mode');
    const kind = mode === 'training' || mode === 'demo' ? mode : null;
    if (kind && !playerId) return json({ error: { code: 'AUTH_REQUIRED', message: 'Entre.' } }, 401);
    const startMatch = u.pathname.match(/^\/api\/sandbox\/(training|demo)\/start$/);
    if (method === 'POST' && startMatch) return json(toView(sandbox(playerId!, startMatch[1] as 'training' | 'demo', true), playerId, { kind: startMatch[1] as 'training' | 'demo', hints: true }));
    switch (`${method} ${u.pathname}`) {
      case 'GET /api/config': return json({ devTools: false });
      case 'POST /api/guest': {
        const id = `g${++n}`;
        const r = srv({ type: 'setName', playerId: id, name: body?.name });
        if (!r.ok) return json({ error: { code: r.code, message: r.message } }, 400);
        const token = tokenFor(id);
        tokens.set(token, id);
        return json({ token, playerId: id, table: toView(table, id) }, 201);
      }
      case 'GET /api/table': return json(kind ? toView(sandbox(playerId!, kind), playerId, { kind, hints: true }) : toView(table, playerId));
      case 'POST /api/commands': {
        if (!playerId) return json({ error: { code: 'AUTH_REQUIRED', message: 'Entre.' } }, 401);
        if (kind) {
          const box = sandbox(playerId, kind);
          const result = box.dispatch({ ...body.command, playerId });
          return json({ result, table: toView(box, playerId, { kind, hints: true }) }, result.ok ? 200 : 422);
        }
        const result = table.dispatch({ ...body.command, id: `${playerId}:${body.command.id}`, playerId });
        return json({ result, table: toView(table, playerId) }, result.ok ? 200 : 422);
      }
      case 'GET /api/preferences': return json({ ...DEFAULT_PREFERENCES, ...(prefs.get(playerId!) ?? {}) });
      case 'PUT /api/preferences': {
        const p = parsePreferences(body);
        if (!p) return json({ error: { code: 'INVALID_PREFERENCES', message: 'inválido' } }, 400);
        const next = { ...DEFAULT_PREFERENCES, ...(prefs.get(playerId!) ?? {}), ...p };
        prefs.set(playerId!, next);
        return json(next);
      }
      case 'GET /api/stats': return json(stats ?? { rounds: 0, hands: 0, wins: 0, losses: 0, pushes: 0, naturals: 0, winRate: null, stake: 0, returned: 0, net: 0, creditsAdded: 0,
        byKind: Object.fromEntries(['main', 'twentyThree', 'pairs', 'buster', 'insurance'].map((k) => [k, { count: 0, wins: 0, stake: 0, returned: 0, net: 0 }])) });
      case 'GET /api/history': return json(history);
      default: return json({ error: { code: 'NOT_FOUND', message: '404' } }, 404);
    }
  };
  return {
    table, srv, addPlayer, calls, tokens, prefs, sandboxes, fetch: fetchImpl, setOffline: (v: boolean) => { offline = v; },
    setStats: (s: PlayerStats, h: RoundHistoryEntry[] = []) => { stats = s; history = h; },
  };
}
export type FakeServer = ReturnType<typeof createFakeServer>;
