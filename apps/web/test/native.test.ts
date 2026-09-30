import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = { native: false };
  const appListeners: ((s: { isActive: boolean }) => void)[] = [];
  const netListeners: ((s: { connected: boolean }) => void)[] = [];
  const removes = { app: vi.fn(), net: vi.fn() };
  const store = new Map<string, string>();
  return {
    state, appListeners, netListeners, removes, store,
    setStyle: vi.fn(async () => {}), hide: vi.fn(async () => {}), netStatus: { connected: true },
  };
});

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.state.native } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_: string, cb: (s: { isActive: boolean }) => void) => { h.appListeners.push(cb); return { remove: h.removes.app }; }) } }));
vi.mock('@capacitor/network', () => ({ Network: {
  addListener: vi.fn(async (_: string, cb: (s: { connected: boolean }) => void) => { h.netListeners.push(cb); return { remove: h.removes.net }; }),
  getStatus: vi.fn(async () => h.netStatus),
} }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: h.setStyle }, Style: { Dark: 'DARK' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: h.hide } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  set: vi.fn(async ({ key, value }: { key: string; value: string }) => { h.store.set(key, value); }),
  get: vi.fn(async ({ key }: { key: string }) => ({ value: h.store.get(key) ?? null })),
  remove: vi.fn(async ({ key }: { key: string }) => { h.store.delete(key); }),
} }));

import { isNative, nativeInit, onResume, watchOnline } from '../src/native';
import { loadIdentity, loadIdentityNative, saveIdentity } from '../src/identity';
import { apiConfigProblems } from '../src/config';

const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => { h.state.native = false; h.appListeners.length = 0; h.netListeners.length = 0; h.removes.app.mockClear(); h.removes.net.mockClear(); h.store.clear(); h.setStyle.mockClear(); h.hide.mockClear(); localStorage.clear(); h.netStatus = { connected: true }; });
afterEach(() => { vi.restoreAllMocks(); });

describe('ponte nativa no navegador (web): nada quebra', () => {
  it('não é nativo; nativeInit não faz nada', async () => {
    expect(isNative()).toBe(false);
    await nativeInit();
    expect(h.setStyle).not.toHaveBeenCalled();
    expect(h.hide).not.toHaveBeenCalled();
  });
  it('onResume dispara quando a aba volta a ficar visível e a limpeza remove o ouvinte', () => {
    const cb = vi.fn();
    const off = onResume(cb);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(h.appListeners).toHaveLength(0); // plugin nativo nem é tocado
  });
  it('watchOnline usa os eventos online/offline', () => {
    const cb = vi.fn();
    const off = watchOnline(cb);
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(cb.mock.calls.map((c) => c[0])).toEqual([false, true]);
    off();
    window.dispatchEvent(new Event('offline'));
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it('sessão e configuração: web não usa armazenamento nativo e não exige URL', async () => {
    saveIdentity({ id: 'a', name: 'Ana', token: 'bj_x' });
    await flush();
    expect(h.store.size).toBe(0);
    expect(await loadIdentityNative()).toBeNull();
    expect(apiConfigProblems('production', '', false)).toEqual([]);
  });
});

describe('app nativo (Capacitor simulado)', () => {
  beforeEach(() => { h.state.native = true; });

  it('nativeInit ajusta a barra de status e esconde a tela de abertura', async () => {
    await nativeInit();
    expect(h.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(h.hide).toHaveBeenCalledTimes(1);
  });

  it('onResume: só sincroniza quando o app fica ATIVO; a limpeza remove o ouvinte nativo', async () => {
    const cb = vi.fn();
    const off = onResume(cb);
    await flush();
    expect(h.appListeners).toHaveLength(1);
    h.appListeners[0]!({ isActive: false }); // foi para o segundo plano
    expect(cb).not.toHaveBeenCalled();
    h.appListeners[0]!({ isActive: true }); // voltou
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(h.removes.app).toHaveBeenCalledTimes(1);
  });

  it('onResume: limpar antes do plugin responder também remove o ouvinte', async () => {
    const off = onResume(vi.fn());
    off(); // antes de flush
    await flush();
    expect(h.removes.app).toHaveBeenCalledTimes(1);
  });

  it('watchOnline usa o plugin Network (mudança e estado inicial)', async () => {
    h.netStatus = { connected: false };
    const cb = vi.fn();
    const off = watchOnline(cb);
    await flush();
    expect(cb).toHaveBeenLastCalledWith(false); // estado inicial
    h.netListeners[0]!({ connected: true });
    expect(cb).toHaveBeenLastCalledWith(true);
    off();
    expect(h.removes.net).toHaveBeenCalledTimes(1);
  });

  it('a sessão é espelhada no armazenamento nativo e recuperada se o localStorage for limpo', async () => {
    saveIdentity({ id: 'p1', name: 'Ana', token: 'bj_' + 'a'.repeat(43) });
    await flush();
    expect(JSON.parse(h.store.get('bj.identity.v2')!)).toMatchObject({ id: 'p1', name: 'Ana' });
    localStorage.clear(); // a WebView perdeu os dados da página
    expect(loadIdentity()).toBeNull();
    expect(await loadIdentityNative()).toMatchObject({ id: 'p1', name: 'Ana', token: 'bj_' + 'a'.repeat(43) });
    saveIdentity(null); // sair
    await flush();
    expect(h.store.has('bj.identity.v2')).toBe(false);
  });

  it('configuração: app nativo sem URL do servidor ou com localhost em produção é recusado', () => {
    expect(apiConfigProblems('native-production', '', true).join(' ')).toMatch(/URL do servidor/);
    expect(apiConfigProblems('native-production', 'http://localhost:3001', true).length).toBeGreaterThan(0);
    expect(apiConfigProblems('native-production', 'https://blackjack.example.invalid', true).join(' ')).toMatch(/placeholder/);
    expect(apiConfigProblems('native-production', 'https://api.meudominio.com', true)).toEqual([]);
    expect(apiConfigProblems('native-development', 'http://10.0.2.2:3001', true)).toEqual([]);
    expect(apiConfigProblems('test', '', true).length).toBeGreaterThan(0); // modo desconhecido é tratado como produção
  });
});
