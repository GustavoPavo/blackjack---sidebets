import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '@bj/engine';
import { getPreferences, putPreferences } from './api';
import { useMediaQuery } from './useMediaQuery';

const KEY = 'bj.prefs.v1';

export function loadLocalPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch { /* storage indisponível */ }
  return { ...DEFAULT_PREFERENCES };
}
function saveLocalPrefs(p: Preferences) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignora */ }
}

export interface PrefsApi {
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
  /** Movimento reduzido já resolvido (preferência do jogador ou do sistema). */
  reducedMotion: boolean;
  /** Preferências do servidor já carregadas (ou indisponíveis). */
  ready: boolean;
}
const Ctx = createContext<PrefsApi>({ prefs: DEFAULT_PREFERENCES, setPrefs: () => {}, reducedMotion: false, ready: true });
export const usePrefs = () => useContext(Ctx);

/**
 * Preferências: aplicadas na hora (cache local) e gravadas no servidor quando há sessão; ao entrar,
 * o que está no servidor vence (fonte de verdade) — exceto quando o servidor ainda só tem os padrões.
 */
export function PrefsProvider({ token, children }: { token?: string; children: ReactNode }) {
  const [prefs, setState] = useState<Preferences>(loadLocalPrefs);
  const pending = useRef<Partial<Preferences>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [ready, setReady] = useState(!token);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    setReady(false);
    getPreferences(token).then((server) => {
      const local = loadLocalPrefs();
      const serverIsDefault = JSON.stringify(server) === JSON.stringify(DEFAULT_PREFERENCES);
      if (serverIsDefault && JSON.stringify(local) !== JSON.stringify(DEFAULT_PREFERENCES)) {
        // o servidor ainda não tem preferências personalizadas: mantém as do aparelho e as envia
        putPreferences(token, local).catch(() => {});
        return;
      }
      setState(server);
      saveLocalPrefs(server);
    }).catch(() => { /* offline: mantém o cache local */ }).finally(() => setReady(true));
  }, [token]);

  const setPrefs = useCallback((patch: Partial<Preferences>) => {
    setState((prev) => { const next = { ...prev, ...patch }; saveLocalPrefs(next); return next; });
    if (!token) return;
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const body = pending.current;
      pending.current = {};
      putPreferences(token, body).catch(() => { /* será regravada na próxima mudança */ });
    }, 300);
  }, [token]);

  const reducedMotion = prefs.reducedMotion === 'on' || (prefs.reducedMotion === 'system' && systemReduced);
  const value = useMemo(() => ({ prefs, setPrefs, reducedMotion, ready }), [prefs, setPrefs, reducedMotion, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
