/**
 * Sessão de convidado guardada no navegador. `token` é a credencial secreta (só o servidor conhece o
 * saldo); `id` é apenas o identificador público do jogador; `name` é só exibição.
 * Sem token → precisa entrar de novo (o nome é lembrado para preencher o formulário).
 */
export interface Identity { id?: string; name: string; token?: string }
const KEY = 'bj.identity.v2';

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.name !== 'string' || !v.name.trim()) return null;
    return {
      name: v.name,
      ...(typeof v.id === 'string' && typeof v.token === 'string' && v.token ? { id: v.id, token: v.token } : {}),
    };
  } catch { return null; /* localStorage indisponível ou inválido */ }
}

export function saveIdentity(i: Identity | null) {
  try {
    if (i) localStorage.setItem(KEY, JSON.stringify(i));
    else localStorage.removeItem(KEY);
  } catch { /* ignora */ }
}
