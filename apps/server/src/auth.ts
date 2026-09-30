import { createHash, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = 'bj_';
/** Token de sessão secreto (256 bits). Só o hash SHA-256 é gravado no banco. */
export const newToken = () => TOKEN_PREFIX + randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const looksLikeToken = (t: unknown): t is string => typeof t === 'string' && t.startsWith(TOKEN_PREFIX) && t.length >= 40 && t.length <= 100;

/** Limitador simples em memória (por chave, janela fixa). */
export class RateLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}
  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt <= t) { this.hits.set(key, { n: 1, resetAt: t + this.windowMs }); return true; }
    if (h.n >= this.max) return false;
    h.n++;
    return true;
  }
}
