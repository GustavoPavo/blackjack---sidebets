import express from 'express';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Table, toView, type Command } from '@bj/engine';

/** RNG criptográfico em [0,1) — o baralho é embaralhado apenas no servidor. */
export const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * Mesa local: uma única mesa em memória, com os 5 lugares controlados pela mesma interface.
 * Isto NÃO é multiplayer online. Para multiplayer, cada lugar passaria a ter uma sessão
 * autenticada e os comandos seriam checados contra o dono do lugar; o motor não muda.
 */
export function createApp(makeTable: () => Table = () => new Table({ rng: cryptoRng })) {
  let table = makeTable();
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/table', (_req, res) => res.json(toView(table)));

  app.post('/api/commands', (req, res) => {
    const command = req.body?.command as Command | undefined;
    if (!command || typeof command !== 'object')
      return res.status(400).json({ result: { ok: false, code: 'INVALID_COMMAND', message: 'Corpo inválido.' }, table: toView(table) });
    const result = table.dispatch(command);
    res.status(result.ok ? 200 : 422).json({ result, table: toView(table) });
  });

  /** Reinicia a simulação local (apenas para testes manuais). */
  app.post('/api/reset', (_req, res) => {
    table = makeTable();
    res.json(toView(table));
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
