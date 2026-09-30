import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RateLimiter } from './auth';
import type { ServerConfig } from './config';
import { GameService, ServiceError } from './gameService';

declare module 'express-serve-static-core' {
  interface Request { playerId?: string; token?: string }
}

export interface AppDeps {
  service: GameService;
  config: Pick<ServerConfig, 'allowedOrigins' | 'devTools'>;
}

const bearer = (req: Request) => {
  const h = req.headers.authorization;
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
};

/**
 * API HTTP. Autenticação: sessão de convidado (token secreto no cabeçalho Authorization). O `playerId`
 * é SEMPRE derivado do token; um identificador público enviado pelo cliente nunca dá acesso a uma carteira.
 */
export function createApp({ service, config }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // CORS por lista de origens (o app nativo usa capacitor://localhost ou https://localhost).
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const auth = (required: boolean) => (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    const playerId = token ? service.authenticate(token) : null;
    if (token && !playerId) return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Sessão inválida ou expirada.' } });
    if (required && !playerId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Entre como convidado.' } });
    req.playerId = playerId ?? undefined;
    req.token = token;
    next();
  };

  app.get('/api/config', (_req, res) => res.json({ devTools: config.devTools }));

  const guestLimiter = new RateLimiter(30, 3600_000);
  app.post('/api/guest', (req, res) => {
    if (!guestLimiter.allow(req.ip ?? 'unknown')) return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente mais tarde.' } });
    const { playerId, token } = service.createGuest(req.body?.name);
    res.status(201).json({ playerId, token, table: service.view(playerId) });
  });

  app.post('/api/session/logout', auth(true), (req, res) => { service.logout(req.token!); res.sendStatus(204); });

  /** Visão pública da mesa; com sessão, inclui a carteira e os lugares do jogador. */
  app.get('/api/table', auth(false), (req, res) => res.json(service.view(req.playerId)));

  app.post('/api/commands', auth(true), (req, res) => {
    const { result, view } = service.execute(req.playerId!, req.body?.command);
    res.status(result.ok ? 200 : 422).json({ result, table: view });
  });

  app.get('/api/preferences', auth(true), (req, res) => res.json(service.getPreferences(req.playerId!)));
  app.put('/api/preferences', auth(true), (req, res) => res.json(service.setPreferences(req.playerId!, req.body)));
  app.get('/api/stats', auth(true), (req, res) => res.json(service.stats(req.playerId!)));
  app.get('/api/history', auth(true), (req, res) => res.json(service.history(req.playerId!, Number(req.query.limit ?? 20) || 20)));

  if (config.devTools) {
    app.post('/api/dev/cancel-round', auth(true), (_req, res) => res.json({ refunded: service.cancelRound(), table: service.view() }));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota inexistente.' } }));

  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(webDist + '/index.html'));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: number }).status) : 500;
    if (status === 400) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Requisição inválida.' } });
    console.error('Erro interno:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno. Tente novamente.' } });
  });
  return app;
}
