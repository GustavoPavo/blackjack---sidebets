/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { App } from '../src/App';
import { ANIMATION } from '../src/usePresentation';
import { createFakeServer, type FakeServer } from './fakeServer';

vi.mock('../src/audio', () => ({ playCard: vi.fn(), playChip: vi.fn(), playWin: vi.fn() }));
import * as audio from '../src/audio';
import { haptic } from '../src/haptics';

let fake: FakeServer;
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

const MEDIA = {
  portrait: (q: string) => q.includes('max-width: 700px') && q.includes('portrait'),
  landscape: (q: string) => q.includes('orientation: landscape') && q.includes('max-height: 520px'),
  none: () => false,
};
function mockMedia(rule: (q: string) => boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: rule(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
}
function start(shoe?: string[]) {
  fake = createFakeServer(shoe);
  vi.stubGlobal('fetch', fake.fetch);
}
function loginAs(id: string, name: string, buyIn = 0) {
  const token = fake.addPlayer(id, name, buyIn);
  localStorage.setItem('bj.identity.v2', JSON.stringify({ id, name, token }));
}
const srv = (c: Record<string, unknown>) => fake.srv(c);

let restore = { ...ANIMATION };
beforeEach(() => { localStorage.clear(); restore = { ...ANIMATION }; Object.assign(ANIMATION, { firstMs: 1, stepMs: 1, holdMs: 1 }); vi.mocked(audio.playCard).mockClear(); vi.mocked(audio.playChip).mockClear(); vi.mocked(audio.playWin).mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(ANIMATION, restore); });

/** Jogador com buy-in e N lugares ocupados. */
function seated(n = 1) {
  loginAs('ana', 'Ana', 100_000);
  for (let i = 0; i < n; i++) srv({ type: 'takeSeat', playerId: 'ana', seat: i });
}

describe('celular na vertical (modo foco)', () => {
  it('faixa de lugares na ordem 5, 4, 3, 2, 1; só o lugar selecionado em destaque; controles na barra inferior', async () => {
    mockMedia(MEDIA.portrait); start(); seated(5);
    const { container } = render(<App />);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Lugar 5', 'Lugar 4', 'Lugar 3', 'Lugar 2', 'Lugar 1']);
    expect(container.querySelector('[data-layout="focus"]')).toBeTruthy();
    expect(screen.getAllByRole('region', { name: /^Lugar \d$/ })).toHaveLength(1);
    expect(container.querySelector('.actionbar')).toBeTruthy();
    expect(container.querySelector('section.controls')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Fichas' })).toBeTruthy(); // fichas dentro da barra
  });

  it('toque na faixa navega entre os lugares', async () => {
    mockMedia(MEDIA.portrait); start(); seated(3);
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByRole('tab');
    await user.click(screen.getByRole('tab', { name: 'Lugar 3' }));
    expect(screen.getByRole('region', { name: 'Lugar 3' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lugar 3' }).getAttribute('aria-selected')).toBe('true');
    await user.click(screen.getByRole('tab', { name: 'Lugar 2' }));
    expect(screen.getByRole('region', { name: 'Lugar 2' })).toBeTruthy();
  });

  it('nome e saldo disponível sempre no topo; "Regras e pagamentos" continua acessível', async () => {
    mockMedia(MEDIA.portrait); start(); seated(1);
    const user = userEvent.setup();
    render(<App />);
    const bar = await screen.findByRole('banner', { name: 'Jogador' });
    expect(within(bar).getByTestId('player-name').textContent).toBe('Ana');
    expect(within(bar).getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00');
    await user.click(within(bar).getByRole('button', { name: 'Regras e pagamentos' }));
    expect(screen.getByRole('dialog', { name: 'Regras e pagamentos' })).toBeTruthy();
  });

  it('detalhes e registros ficam em painel recolhível (Menu), não na mesa', async () => {
    mockMedia(MEDIA.portrait); start(); seated(1);
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findAllByRole('tab');
    expect(container.querySelector('.table-rim')!.textContent).not.toMatch(/Histórico de créditos|Registro da mesa/);
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByText(/Histórico de créditos \(1\)/)).toBeTruthy();
    expect(within(menu).getByText('Registro da mesa')).toBeTruthy();
    expect(within(menu).getByText('Configurações')).toBeTruthy();
  });

  it('split: a mão ativa é marcada e as outras ficam esmaecidas; ações bloqueadas durante a apresentação', async () => {
    mockMedia(MEDIA.portrait);
    start(['8S', '6D', '8H', '10C', '3C', '2D', '9H']); seated(1);
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 1000 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    Object.assign(ANIMATION, { firstMs: 60, stepMs: 120, holdMs: 60 });
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(await screen.findByText('Distribuir'));
    // durante a distribuição: sem botões de jogada
    await screen.findByText('Distribuindo…');
    expect(screen.queryByText('Parar (Stand)')).toBeNull();
    expect((container.querySelector('.deal') as HTMLButtonElement | null)).toBeNull();
    await screen.findByText('Dividir (Split)', {}, { timeout: 4000 });
    await user.click(screen.getByText('Dividir (Split)'));
    await waitFor(() => expect(container.querySelectorAll('.hand').length).toBe(2), { timeout: 4000 });
    await waitFor(() => expect(container.querySelectorAll('.hand.active').length).toBe(1), { timeout: 4000 });
    expect(container.querySelectorAll('.hand.dim')).toHaveLength(1);
    expect(screen.getByText(/Mão 1\/2 · ativa/)).toBeTruthy();
    expect(screen.getByText(/mão 1 de 2/)).toBeTruthy();
    expect(screen.getByLabelText('Mão anterior')).toBeTruthy(); // navegação entre mãos
    expect(screen.getByLabelText('Próxima mão')).toBeTruthy();
  });
});

describe('celular na horizontal (mesa completa)', () => {
  it('mostra os cinco lugares na ordem 5, 4, 3, 2, 1, compactos, com a barra de controles embaixo', async () => {
    mockMedia(MEDIA.landscape); start(); seated(2);
    const { container } = render(<App />);
    await screen.findAllByText('Lugar disponível');
    expect(container.querySelector('[data-layout="compact"]')).toBeTruthy();
    const seats = screen.getAllByRole('region', { name: /^Lugar \d$/ });
    expect(seats).toHaveLength(5);
    const cols = seats.map((el) => ({ n: Number(el.getAttribute('data-seat')), col: Number((el.closest('.seatslot') as HTMLElement).style.gridColumn) }));
    expect(cols.sort((a, b) => a.col - b.col).map((c) => c.n)).toEqual([5, 4, 3, 2, 1]);
    expect(container.querySelectorAll('.seat.compact').length).toBe(2);
    expect(container.querySelector('.actionbar')).toBeTruthy();
  });
});

describe('desktop continua com a mesa completa', () => {
  it('layout de mesa, controles abaixo da mesa e botão de regras no cabeçalho', async () => {
    mockMedia(MEDIA.none); start(); seated(1);
    const { container } = render(<App />);
    await screen.findAllByText('Lugar disponível');
    expect(container.querySelector('[data-layout="table"]')).toBeTruthy();
    expect(container.querySelector('section.controls')).toBeTruthy();
    expect(container.querySelector('.actionbar')).toBeNull();
    expect(screen.getByText(/Regras e pagamentos/)).toBeTruthy();
  });
});

describe('áreas seguras e toque', () => {
  it('viewport-fit=cover e insets de câmera/barras/indicador inferior', () => {
    expect(html).toMatch(/viewport-fit=cover/);
    for (const side of ['top', 'bottom', 'left', 'right']) expect(css).toContain(`env(safe-area-inset-${side}`);
    expect(css).toMatch(/\.actionbar[^}]*calc\(8px \+ var\(--safe-b\)\)/s);
    expect(css).toMatch(/\.layout-focus \.topbar[^}]*var\(--safe-t\)/s);
  });
  it('botões grandes na barra de ações (alvo de toque ≥ 48px)', () => {
    expect(css).toMatch(/\.layout-focus \.act \{ min-height: 5\d+px/);
    expect(css).toMatch(/\.layout-focus \.actionbar \.row button, \.layout-focus \.actionbar \.deal \{[^}]*min-height: 52px/);
  });
  it('sem rolagem horizontal da página: overflow horizontal só em áreas internas', () => {
    expect(css).toMatch(/\.hands\.strip \.hands-row \{[^}]*overflow-x: auto/);
    expect(css).not.toMatch(/(^|\n)body \{[^}]*overflow-x: scroll/);
  });
});

describe('fichas e apostas', () => {
  it('ficha selecionada em destaque; fichas aparecem na área apostada com o valor total', async () => {
    mockMedia(MEDIA.none); start(); seated(1);
    const user = userEvent.setup();
    const { container } = render(<App />);
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(screen.getByRole('radio', { name: 'Ficha R$ 25,00' }));
    expect(screen.getByRole('radio', { name: 'Ficha R$ 25,00' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Ficha R$ 25,00' }).className).toMatch(/\bsel\b/);
    expect(screen.getByRole('radio', { name: 'Ficha R$ 5,00' }).getAttribute('aria-checked')).toBe('false');
    expect(within(seat).getByText('Principal').closest('button')!.querySelector('.pchip')).toBeNull(); // sem aposta, sem fichas
    await user.click(within(seat).getByText('Principal'));
    await waitFor(() => expect(within(seat).getByText('R$ 25,00', { selector: 'b.bet-amount' })).toBeTruthy());
    const chips = container.querySelectorAll('[data-seat="1"] .bet.main .pchip');
    expect(chips.length).toBe(1);
    expect(chips[0]!.className).toMatch(/chip-2500/);
  });
});

describe('preferências', () => {
  it('som, vibração, velocidade e movimento reduzido: salvos no navegador e no servidor', async () => {
    mockMedia(MEDIA.none); start(); seated(1);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByText('Configurações'));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    await user.click(within(menu).getByLabelText('Efeitos sonoros'));
    await user.click(within(menu).getByLabelText('Vibração'));
    await user.click(within(menu).getByLabelText('Rápida'));
    await user.selectOptions(within(menu).getByLabelText('Movimento reduzido'), 'on');
    const local = JSON.parse(localStorage.getItem('bj.prefs.v1')!);
    expect(local).toMatchObject({ sound: false, vibration: false, animationSpeed: 'fast', reducedMotion: 'on' });
    await waitFor(() => expect(fake.prefs.get('ana')).toMatchObject({ sound: false, vibration: false, animationSpeed: 'fast', reducedMotion: 'on' }), { timeout: 2000 });
  });

  it('as preferências do servidor são aplicadas ao entrar', async () => {
    mockMedia(MEDIA.none); start(); seated(1);
    fake.prefs.set('ana', { sound: false, vibration: true, animationSpeed: 'fast', reducedMotion: 'on', trainingHints: true, tutorialSeen: true });
    const { container } = render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await waitFor(() => expect(container.querySelector('.reduce-motion')).toBeTruthy());
  });

  it('movimento reduzido: as cartas não "voam" do shoe', async () => {
    mockMedia(MEDIA.none); start(['10S', '10D', '9H', '8C']); seated(1);
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 500 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    localStorage.setItem('bj.prefs.v1', JSON.stringify({ reducedMotion: 'on' }));
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(await screen.findByText('Distribuir'));
    await screen.findByText('Parar (Stand)', {}, { timeout: 4000 });
    expect(container.querySelector('.reduce-motion')).toBeTruthy();
    expect(container.querySelectorAll('.card.flying')).toHaveLength(0);
  });
});

describe('som e vibração', () => {
  it('respeitam as preferências: cartas na distribuição, fichas ao apostar, vitória só no fim', async () => {
    mockMedia(MEDIA.none); start(['10S', '10D', '9H', '8C']); seated(1);
    const vib = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate: vib });
    const user = userEvent.setup();
    render(<App />);
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(within(seat).getByText('Principal'));
    await waitFor(() => expect(audio.playChip).toHaveBeenCalledTimes(1));
    expect(vib).toHaveBeenCalled();
    await user.click(within(seat).getByText('Confirmar apostas'));
    await user.click(await screen.findByText('Distribuir'));
    await screen.findByText('Parar (Stand)', {}, { timeout: 4000 });
    expect(audio.playCard).toHaveBeenCalledTimes(4); // 2 cartas do jogador + 2 do dealer
    expect(audio.playWin).not.toHaveBeenCalled(); // ainda não terminou
    await user.click(screen.getByText('Parar (Stand)'));
    await screen.findByRole('status', {}, { timeout: 4000 });
    await waitFor(() => expect(audio.playWin).toHaveBeenCalledTimes(1)); // 19 x 18: vitória
  });

  it('com som e vibração desligados, nada toca nem vibra', async () => {
    mockMedia(MEDIA.none); start(['10S', '10D', '9H', '8C']); seated(1);
    localStorage.setItem('bj.prefs.v1', JSON.stringify({ sound: false, vibration: false }));
    const vib = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate: vib });
    const user = userEvent.setup();
    render(<App />);
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(within(seat).getByText('Principal'));
    await user.click(within(seat).getByText('Confirmar apostas'));
    await user.click(await screen.findByText('Distribuir'));
    await screen.findByText('Parar (Stand)', {}, { timeout: 4000 });
    await user.click(screen.getByText('Parar (Stand)'));
    await screen.findByRole('status', {}, { timeout: 4000 });
    expect(audio.playCard).not.toHaveBeenCalled();
    expect(audio.playChip).not.toHaveBeenCalled();
    expect(audio.playWin).not.toHaveBeenCalled();
    expect(vib).not.toHaveBeenCalled();
  });

  it('vibração nunca lança erro no navegador (com ou sem suporte, nativo ou não)', async () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined });
    await expect(haptic('success')).resolves.toBeUndefined();
    vi.stubGlobal('navigator', { ...navigator, vibrate: () => { throw new Error('bloqueado'); } });
    await expect(haptic('light')).resolves.toBeUndefined();
    (globalThis as any).Capacitor = { isNativePlatform: () => true }; // simula o app nativo sem o plugin disponível
    await expect(haptic('warning')).resolves.toBeUndefined();
    delete (globalThis as any).Capacitor;
  });
});
