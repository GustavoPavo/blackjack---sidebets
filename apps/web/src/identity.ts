/**
 * Sessão de convidado guardada no navegador. `token` é a credencial secreta (só o servidor conhece o
 * saldo); `id` é apenas o identificador público do jogador; `name` é só exibição.
 * Sem token → precisa entrar de novo (o nome é lembrado para preencher o formulário).
 */
export interface Identity { id?: string; name: string; token?: string }
const KEY = 'bj.identity.v2';

import { isNative } from './native';

function parseIdentity(raw: string | null | undefined): Identity | null {
  try {
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.name !== 'string' || !v.name.trim()) return null;
    return {
      name: v.name,
      ...(typeof v.id === 'string' && typeof v.token === 'string' && v.token ? { id: v.id, token: v.token } : {}),
    };
  } catch { return null; /* inválido */ }
}

export function loadIdentity(): Identity | null {
  try { return parseIdentity(localStorage.getItem(KEY)); } catch { return null; /* localStorage indisponível */ }
}

/**
 * Grava a sessão. No app nativo também espelha no armazenamento nativo (plugin Preferences: UserDefaults /
 * SharedPreferences), que sobrevive melhor do que o localStorage da WebView se o sistema limpar dados da página.
 */
export function saveIdentity(i: Identity | null) {
  try {
    if (i) localStorage.setItem(KEY, JSON.stringify(i));
    else localStorage.removeItem(KEY);
  } catch { /* ignora */ }
  void mirrorNative(i);
}

async function mirrorNative(i: Identity | null) {
  if (!isNative()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    if (i) await Preferences.set({ key: KEY, value: JSON.stringify(i) });
    else await Preferences.remove({ key: KEY });
  } catch { /* sem plugin */ }
}

/** Recupera a sessão do armazenamento nativo (quando o localStorage da WebView foi limpo). */
export async function loadIdentityNative(): Promise<Identity | null> {
  if (!isNative()) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: KEY });
    return parseIdentity(value);
  } catch { return null; }
}
