import express from 'express';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Table, toView, type Command } from '@bj/engine';

/** RNG criptográfico em [0,1) — o baralho é embaralhado apenas no servidor. */
export const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * Mesa local: uma única mesa em memória. Cada navegador é um jogador (id estável gerado no cliente)
 * que pode ocupar vários lugares com uma única carteira. Isto NÃO é multiplayer online: o `playerId`
 * é só um identificador (não há autenticação). Para multiplayer, ele viria de uma sessão autenticada;
 * o motor já valida que cada lugar só recebe comandos do seu dono.
 */
export function createApp(makeTable: () => Table = () => new Table({ rng: cryptoRng })) {
  let table = makeTable();
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  const viewerOf = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined);

  /** `?playerId=` personaliza a visão (carteira e lugares do jogador); o estado da mesa é o mesmo para todos. */
  app.get('/api/table', (req, res) => res.json(toView(table, viewerOf(req.query.playerId))));

  app.post('/api/commands', (req, res) => {
    const command = req.body?.command as Command | undefined;
    if (!command || typeof command !== 'object')
      return res.status(400).json({ result: { ok: false, code: 'INVALID_COMMAND', message: 'Corpo inválido.' }, table: toView(table) });
    const viewer = viewerOf((command as { playerId?: unknown }).playerId);
    const result = table.dispatch(command);
    res.status(result.ok ? 200 : 422).json({ result, table: toView(table, viewer) });
  });

  /** Reinicia a simulação local (apenas para testes manuais). */
  app.post('/api/reset', (req, res) => {
    table = makeTable();
    res.json(toView(table, viewerOf(req.query.playerId)));
  });

  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(webDist + '/index.html'));
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const bad = typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 400;
    res.status(bad ? 400 : 500).json({ result: { ok: false, code: 'INVALID_COMMAND', message: 'Requisição inválida.' } });
  });
  return app;
}
