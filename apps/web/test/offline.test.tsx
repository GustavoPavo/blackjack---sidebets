import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { RETRY_DELAYS } from '../src/api';
import { ANIMATION } from '../src/usePresentation';
import { createFakeServer, type FakeServer } from './fakeServer';

let fake: FakeServer;
function start(shoe?: string[]) { fake = createFakeServer(shoe); vi.stubGlobal('fetch', fake.fetch); }
function loginAs(id: string, name: string, buyIn = 0) {
  const token = fake.addPlayer(id, name, buyIn);
  localStorage.setItem('bj.identity.v2', JSON.stringify({ id, name, token }));
  localStorage.setItem('bj.prefs.v1', JSON.stringify({ tutorialSeen: true }));
}
const srv = (c: Record<string, unknown>) => fake.srv(c);
const setNavigatorOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v);
const goOffline = () => { setNavigatorOnline(false); act(() => { window.dispatchEvent(new Event('offline')); }); };
const goOnline = () => { setNavigatorOnline(true); act(() => { window.dispatchEvent(new Event('online')); }); };
const commands = () => fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/commands').length;
const tableGets = () => fake.calls.filter((c) => c.method === 'GET' && c.path === '/api/table').length;

let restoreAnim = { ...ANIMATION };
let restoreRetry = [...RETRY_DELAYS];
beforeEach(() => {
  localStorage.clear();
  restoreAnim = { ...ANIMATION }; Object.assign(ANIMATION, { firstMs: 1, stepMs: 1, holdMs: 1 });
  restoreRetry = [...RETRY_DELAYS]; RETRY_DELAYS.splice(0, RETRY_DELAYS.length, 5, 5, 5);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.assign(ANIMATION, restoreAnim); RETRY_DELAYS.splice(0, RETRY_DELAYS.length, ...restoreRetry); });

describe('falta de conexão', () => {
  it('avisa, bloqueia as ações e não envia nada; ao reconectar sincroniza e libera', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    const user = userEvent.setup();
    render(<App />);
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
    goOffline();
    expect(await screen.findByText('Sem conexão.')).toBeTruthy();
    const before = commands();
    expect((within(seat).getByText('Principal').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Distribuir') as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(seat).getByText('Principal'));
    expect(commands()).toBe(before); // nenhum comando saiu
    const getsBefore = tableGets();
    goOnline();
    await waitFor(() => expect(screen.queryByText('Sem conexão.')).toBeNull());
    expect(tableGets()).toBeGreaterThan(getsBefore); // consultou o estado do servidor
    await user.click(within(seat).getByText('Principal'));
    await waitFor(() => expect(fake.table.seats[0]!.bets.main).toBe(500));
  });

  it('ao reconectar mostra o estado que o servidor já tem, direto e sem animar nem repetir ações', async () => {
    start(['10S', '10D', '9H', '8C']); loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 500 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    Object.assign(ANIMATION, { firstMs: 400, stepMs: 400, holdMs: 400 }); // lenta: se animasse, daria para ver
    render(<App />);
    await screen.findByText('Distribuir');
    goOffline();
    await screen.findByText('Sem conexão.');
    srv({ type: 'deal', playerId: 'ana' }); // a rodada avança enquanto o app estava sem conexão
    const cmdsBefore = commands();
    goOnline();
    // estado final direto: as ações da vez aparecem, sem passar por "Distribuindo…"
    await screen.findByText('Parar (Stand)');
    expect(screen.queryByText('Distribuindo…')).toBeNull();
    expect(commands()).toBe(cmdsBefore); // nada foi reenviado
    expect(fake.table.balanceOf('ana')).toBe(99_500);
  });

  it('volta do segundo plano (visibilitychange): consulta o servidor e mostra o que mudou', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    srv({ type: 'rebuy', playerId: 'ana', amount: 50_000 }); // mudou enquanto o app estava em segundo plano
    const gets = tableGets();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.500,00'));
    expect(tableGets()).toBeGreaterThan(gets);
  });

  it('resposta perdida: a repetição automática usa o MESMO id e o servidor não credita em dobro', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Rebuy'));
    fake.dropNextCommandResponse(); // o servidor aplica o rebuy, mas a resposta se perde
    await user.click(await screen.findByText('Confirmar rebuy'));
    // a repetição automática reenvia o MESMO comando; o servidor reconhece e não credita de novo
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 2.000,00'));
    expect(commands()).toBe(2); // tentativa original + UMA repetição
    expect(fake.table.balanceOf('ana')).toBe(100_000 + 100_000); // buy-in 1000 + UM rebuy de 1000
    expect(fake.table.players.get('ana')!.ledger.map((l) => l.type)).toEqual(['buyIn', 'rebuy']);
    expect(screen.queryByText(/Sem (conexão|resposta)/)).toBeNull();
  });

  it('servidor inacessível (rede ok): avisa, bloqueia e volta sozinho quando o servidor responde', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    const user = userEvent.setup();
    render(<App />);
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    fake.setOffline(true); // fetch falha, mas navigator.onLine segue true
    await user.click(within(seat).getByText('Principal'));
    expect(await screen.findByText('Sem resposta do servidor.')).toBeTruthy();
    expect(fake.table.seats[0]!.bets.main).toBe(0);
    fake.setOffline(false);
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(screen.queryByText('Sem resposta do servidor.')).toBeNull());
    await user.click(within(seat).getByText('Principal'));
    await waitFor(() => expect(fake.table.seats[0]!.bets.main).toBe(500));
  });
});

describe('app nativo sem servidor configurado', () => {
  it('mostra uma tela de erro clara em vez de chamar a rede', async () => {
    vi.resetModules();
    vi.doMock('../src/native', async () => {
      const real = await vi.importActual<typeof import('../src/native')>('../src/native');
      return { ...real, isNative: () => true };
    });
    start();
    const { App: NativeApp } = await import('../src/App');
    render(<NativeApp />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/App mal configurado/);
    expect(alert.textContent).toMatch(/URL do servidor/);
    expect(fake.calls).toHaveLength(0); // nenhuma chamada de rede
    vi.doUnmock('../src/native');
  });
});
