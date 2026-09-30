/** Identidade do jogador guardada no navegador: id estável (chave da carteira) + nome (só exibição). */
export interface Identity { id: string; name: string }
const KEY = 'bj.identity.v1';

export function newPlayerId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.id === 'string' && v.id && typeof v?.name === 'string' && v.name.trim()) return { id: v.id, name: v.name };
  } catch { /* localStorage indisponível ou inválido */ }
  return null;
}

export function saveIdentity(i: Identity) {
  try { localStorage.setItem(KEY, JSON.stringify(i)); } catch { /* ignora */ }
}
