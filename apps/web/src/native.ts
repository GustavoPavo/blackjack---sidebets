import { Capacitor } from '@capacitor/core';

/**
 * Ponte com o app nativo (Capacitor). No navegador tudo cai em equivalentes da web ou não faz nada:
 * nenhuma função aqui lança erro fora do app nativo.
 */
export const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** Barra de status escura e fim da tela de abertura quando a primeira tela estiver pronta. */
export async function nativeInit(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
  } catch { /* plugin indisponível */ }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* plugin indisponível */ }
}

/**
 * Chama `cb` quando o app volta ao primeiro plano (nativo: appStateChange) ou a aba volta a ficar visível (web).
 * O chamador deve SINCRONIZAR com o servidor (consulta), nunca reenviar ações.
 */
export function onResume(cb: () => void): () => void {
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const onVisibility = () => { if (document.visibilityState === 'visible') cb(); };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
  if (isNative()) {
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', (s) => { if (s.isActive) cb(); });
      if (disposed) void handle.remove(); else cleanups.push(() => void handle.remove());
    }).catch(() => { /* sem plugin: só a visibilidade da página */ });
  }
  return () => { disposed = true; cleanups.forEach((f) => f()); };
}

/** Observa a conectividade (nativo: plugin Network; web: eventos online/offline). Retorna a função de limpeza. */
export function watchOnline(cb: (online: boolean) => void): () => void {
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  cleanups.push(() => { window.removeEventListener('online', on); window.removeEventListener('offline', off); });
  if (isNative()) {
    import('@capacitor/network').then(async ({ Network }) => {
      const handle = await Network.addListener('networkStatusChange', (s) => cb(s.connected));
      if (disposed) void handle.remove(); else cleanups.push(() => void handle.remove());
      const status = await Network.getStatus();
      if (!disposed) cb(status.connected);
    }).catch(() => { /* sem plugin: só os eventos da web */ });
  }
  return () => { disposed = true; cleanups.forEach((f) => f()); };
}
