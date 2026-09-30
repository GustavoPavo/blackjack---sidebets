/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ANIMATION } from '../src/usePresentation';
import { createFakeServer, type FakeServer } from './fakeServer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let fake: FakeServer;
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function startServer(shoe?: string[]) {
  fake = createFakeServer(shoe);
  vi.stubGlobal('fetch', fake.fetch);
}
const srv = (c: any) => fake.srv(c);
const saved = () => JSON.parse(localStorage.getItem('bj.identity.v2') ?? 'null');
/** Jogador já cadastrado no servidor, com sessão salva neste navegador. */
function loginAs(id: string, name: string, buyIn = 0) {
  const token = fake.addPlayer(id, name, buyIn);
  localStorage.setItem('bj.identity.v2', JSON.stringify({ id, name, token }));
}

const seat = (k: number) => screen.getByRole('region', { name: `Lugar ${k}` });
const fast = { firstMs: 1, stepMs: 1, holdMs: 1 };
let restore = { ...ANIMATION };

beforeEach(() => { localStorage.clear(); restore = { ...ANIMATION }; Object.assign(ANIMATION, fast); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(ANIMATION, restore); });

describe('nome do jogador', () => {
  it('pede o nome uma única vez, salva no navegador e não pede de novo', async () => {
    startServer();
    const user = userEvent.setup();
    const first = render(<App />);
    await user.type(screen.getByLabelText('Seu nome'), 'Ana');
    await user.click(screen.getByText('Começar'));
    await screen.findByText('Saldo disponível');
    expect(saved()).toMatchObject({ name: 'Ana' });
    const id = saved().id;
    expect(typeof id).toBe('string');
    first.unmount();
    render(<App />); // nova visita
    await screen.findByText('Saldo disponível');
    expect(screen.queryByLabelText('Seu nome')).toBeNull();
    expect(screen.getByTestId('player-name').textContent).toBe('Ana');
    expect(saved().id).toBe(id);
  });

  it('sessão inválida no servidor volta à tela de nome, lembrando o nome', async () => {
    startServer();
    localStorage.setItem('bj.identity.v2', JSON.stringify({ id: 'x', name: 'Ana', token: 'bj_' + 'q'.repeat(43) }));
    render(<App />);
    const input = (await screen.findByLabelText('Seu nome')) as HTMLInputElement;
    expect(input.value).toBe('Ana');
    expect(saved()).toEqual({ name: 'Ana' });
  });

  it('o cliente nunca envia playerId (a identidade vem da sessão)', async () => {
    startServer();
    loginAs('ana', 'Ana', 100_000);
    const bodies: string[] = [];
    const inner = fake.fetch;
    vi.stubGlobal('fetch', (u: string, i?: RequestInit) => { if (i?.body) bodies.push(String(i.body)); return inner(u, i); });
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await screen.findByRole('region', { name: 'Lugar 1' })).getByText('Sentar aqui'));
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies.join('')).not.toMatch(/playerId/);
  });

  it('"Editar nome" atualiza o nome em todos os lugares, sem mudar identidade nem saldo', async () => {
    startServer();
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'takeSeat', playerId: 'ana', seat: 3 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(screen.getByText('Editar nome'));
    const input = screen.getByLabelText('Seu nome');
    await user.clear(input);
    await user.type(input, 'Ana Maria');
    await user.click(screen.getByText('Salvar nome'));
    await waitFor(() => expect(within(seat(1)).getByText(/Ana Maria/)).toBeTruthy());
    expect(within(seat(4)).getByText(/Ana Maria/)).toBeTruthy();
    expect(screen.getByTestId('player-name').textContent).toBe('Ana Maria');
    expect(saved()).toMatchObject({ id: 'ana', name: 'Ana Maria' });
    expect(fake.table.players.size).toBe(1);
    expect(fake.table.balanceOf('ana')).toBe(100_000);
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00');
  });
});

describe('mesa', () => {
  it('lugares ficam na ordem visual 5, 4, 3, 2, 1 (lugar 1 à direita)', async () => {
    startServer();
    loginAs('ana', 'Ana');
    render(<App />);
    await screen.findAllByText('Lugar disponível');
    const slots = screen.getAllByRole('region', { name: /^Lugar \d$/ }).map((el) => ({
      n: Number(el.getAttribute('data-seat')),
      col: Number((el.closest('.seatslot') as HTMLElement).style.gridColumn),
      row: (el.closest('.seatslot') as HTMLElement).style.gridRow,
    }));
    expect(new Set(slots.map((s) => s.row))).toEqual(new Set(['1'])); // todos na mesma fileira (semicírculo)
    expect(slots.sort((a, b) => a.col - b.col).map((s) => s.n)).toEqual([5, 4, 3, 2, 1]);
    expect(slots.find((s) => s.n === 1)!.col).toBe(5);
  });

  it('5 lugares disponíveis e aviso de simulação local', async () => {
    startServer();
    loginAs('ana', 'Ana');
    render(<App />);
    await screen.findByText(/Simulação local/);
    expect(screen.getByText(/Não é multiplayer online/)).toBeTruthy();
    expect(screen.getAllByText('Lugar disponível')).toHaveLength(5);
  });

  it('buy-in inicial no topo (máx. R$ 1.000,00); depois senta em vários lugares sem novo buy-in', async () => {
    startServer();
    loginAs('ana', 'Ana');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Buy-in inicial');
    expect(screen.queryByText('Sentar aqui')).toBeNull(); // sem carteira não senta
    await user.click(screen.getByText('Buy-in inicial'));
    const input = screen.getByLabelText('Valor em reais');
    await user.clear(input);
    await user.type(input, '1500');
    expect(screen.getByRole('alert').textContent).toMatch(/Máximo R\$ 1\.000,00/);
    expect((screen.getByText('Confirmar buy-in') as HTMLButtonElement).disabled).toBe(true);
    await user.clear(input);
    await user.type(input, '1000');
    await user.click(screen.getByText('Confirmar buy-in'));
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00'));
    expect(screen.queryByText('Buy-in inicial')).toBeNull(); // só uma vez
    await user.click(within(seat(1)).getByText('Sentar aqui'));
    await waitFor(() => expect(fake.table.seats[0]!.playerId).toBe('ana'));
    await user.click(within(seat(5)).getByText('Sentar aqui'));
    await waitFor(() => expect(fake.table.seats[4]!.playerId).toBe('ana'));
    expect(fake.table.players.get('ana')!.ledger).toHaveLength(1); // nenhum buy-in por lugar
    expect(within(seat(1)).queryByText(/buy-in/i)).toBeNull();
    // apostas dos dois lugares consomem a mesma carteira exibida no topo
    await user.click(within(seat(1)).getByText('Principal'));
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 995,00'));
    await user.click(within(seat(5)).getByText('Principal'));
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 990,00'));
  });

  it('side bets desabilitadas sem aposta principal; rebuy some depois de confirmar', async () => {
    startServer();
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    expect((within(seat(1)).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Rebuy')).toBeTruthy();
    await user.click(within(seat(1)).getByText('Principal'));
    await waitFor(() => expect(fake.table.seats[0]!.bets.main).toBe(500));
    expect((within(seat(1)).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(seat(1)).getByText('Confirmar apostas'));
    await waitFor(() => expect(screen.queryByText('Rebuy')).toBeNull());
  });
});

describe('Repetir aposta e X2', () => {
  async function afterRound() {
    startServer(['10S', '10D', '9H', '8C']);
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 1000 });
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'buster', amount: 250 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    srv({ type: 'deal', playerId: 'ana' });
    srv({ type: 'action', playerId: 'ana', seat: 0, action: 'stand' });
    srv({ type: 'nextRound', playerId: 'ana' });
  }
  it('botões aparecem na fase de apostas; clicar repetidamente não duplica o débito', async () => {
    await afterRound();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await screen.findByText('Repetir aposta');
    expect(within(seat(1)).getByText('X2')).toBeTruthy();
    const start = fake.table.balanceOf('ana');
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    await waitFor(() => expect(fake.table.seats[0]!.bets.main).toBe(1000));
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    expect(fake.table.seats[0]!.bets).toMatchObject({ main: 1000, buster: 250 });
    expect(fake.table.balanceOf('ana')).toBe(start - 1250);
    await user.click(within(seat(1)).getByText('X2'));
    await waitFor(() => expect(fake.table.seats[0]!.bets.main).toBe(2000));
    await user.click(within(seat(1)).getByText('X2'));
    expect(fake.table.balanceOf('ana')).toBe(start - 2500);
    // ainda dá para confirmar e jogar
    expect(within(seat(1)).getByText('Confirmar apostas')).toBeTruthy();
  });
  it('sem saldo para o conjunto completo: mantém as apostas e mostra mensagem clara', async () => {
    await afterRound();
    // esvazia a carteira em outro lugar do mesmo jogador
    srv({ type: 'takeSeat', playerId: 'ana', seat: 2 });
    srv({ type: 'setBet', playerId: 'ana', seat: 2, kind: 'main', amount: fake.table.balanceOf('ana') - 500 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await screen.findByText('X2');
    const before = fake.table.balanceOf('ana');
    await user.click(within(seat(1)).getByText('X2'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Saldo insuficiente para X2/);
    expect(fake.table.seats[0]!.bets.main).toBe(0);
    expect(fake.table.balanceOf('ana')).toBe(before);
  });
});

describe('mensagem de ganho total', () => {
  it('só aparece depois da distribuição, dos turnos e da animação final do dealer', async () => {
    startServer(['10S', '10D', '9H', '8C']); // jogador 19 vs dealer 18
    Object.assign(ANIMATION, { firstMs: 120, stepMs: 120, holdMs: 120 });
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 500 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Distribuir');
    await user.click(screen.getByText('Distribuir'));
    expect(screen.queryByRole('status')).toBeNull();
    await screen.findByText('Parar (Stand)', {}, { timeout: 3000 });
    expect(screen.queryByRole('status')).toBeNull(); // turnos em andamento
    await user.click(screen.getByText('Parar (Stand)'));
    await screen.findByText('Dealer jogando…');
    expect(screen.queryByRole('status')).toBeNull(); // animação final do dealer
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 995,00'); // saldo final ainda não revelado
    const msg = await screen.findByRole('status', {}, { timeout: 3000 });
    expect(msg.textContent).toContain('Você ganhou R$ 5,00');
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.005,00');
    // detalhamento opcional por lugar e tipo de aposta
    await user.click(within(msg).getByText('Detalhes por lugar e aposta'));
    expect(within(msg).getByText(/Lugar 1: \+R\$ 5,00/)).toBeTruthy();
    expect(within(msg).getByText(/Principal: Vitória/)).toBeTruthy();
  });

  it('empate → "Rodada empatada"; perda → "Resultado da rodada: −R$ …"', async () => {
    startServer(['10S', '10D', '8H', '8C']); // 18 x 18
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'setBet', playerId: 'ana', seat: 0, kind: 'main', amount: 500 });
    srv({ type: 'confirmBets', playerId: 'ana', seat: 0 });
    srv({ type: 'deal', playerId: 'ana' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Parar (Stand)'));
    expect((await screen.findByRole('status')).textContent).toContain('Rodada empatada');
  });
});

describe('design da mesa', () => {
  it('cinco lugares e o dealer ficam dentro da mesa (borda de madeira + feltro)', async () => {
    startServer();
    loginAs('ana', 'Ana');
    const { container } = render(<App />);
    await screen.findAllByText('Lugar disponível');
    const rim = container.querySelector('.table-surface > .table-rim')!;
    expect(rim).toBeTruthy();
    expect(rim.querySelector('[aria-label="Dealer"]')).toBeTruthy();
    expect(rim.querySelectorAll('.seats .seat')).toHaveLength(5);
    expect(rim.textContent).toContain('BLACKJACK PAGA 3:2');
  });

  it('fichas circulares: uma para cada valor, todas com cores diferentes', async () => {
    startServer();
    loginAs('ana', 'Ana');
    render(<App />);
    await screen.findByRole('radio', { name: 'Ficha R$ 2,50' });
    const names = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual(['Ficha R$ 2,50', 'Ficha R$ 5,00', 'Ficha R$ 10,00', 'Ficha R$ 25,00', 'Ficha R$ 50,00', 'Ficha R$ 100,00']);
    const colors = [250, 500, 1000, 2500, 5000, 10000].map((v) => {
      const m = css.match(new RegExp(`\\.chip-${v}\\s*\\{\\s*--chip-color:\\s*(#[0-9a-fA-F]{3,8})`));
      expect(m, `cor da ficha ${v}`).not.toBeNull();
      return m![1]!.toLowerCase();
    });
    expect(new Set(colors).size).toBe(6);
    expect(css).toMatch(/\.chip\s*\{[^}]*border-radius:\s*50%/); // circulares
  });

  it('"Regras e pagamentos" abre o guia com as três side bets e fecha (botão ou Esc)', async () => {
    startServer();
    loginAs('ana', 'Ana');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText(/Regras e pagamentos/));
    const dialog = screen.getByRole('dialog', { name: 'Regras e pagamentos' });
    for (const t of ['23+1', 'Pares', 'Buster Lucky']) expect(within(dialog).getByText(t)).toBeTruthy();
    expect(within(dialog).getAllByText('100:1').length).toBeGreaterThan(0); // Suited Trips (e Buster 7 cartas)
    expect(within(dialog).getByText('200:1')).toBeTruthy(); // Buster 8+
    expect(within(dialog).getByText('25:1')).toBeTruthy(); // Perfect Pair
    expect(dialog.textContent).toMatch(/A-2-3 e Q-K-A/);
    expect(dialog.textContent).toMatch(/mesmo rank/);
    await user.click(within(dialog).getByLabelText('Fechar regras'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByText(/Regras e pagamentos/));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('distribuição animada começa pelos jogadores: dealer só recebe depois da 1ª carta dos lugares', async () => {
    startServer(['10S', '10H', '10D', '9C', '8C', '7C']); // lugares 1 e 2 apostando
    Object.assign(ANIMATION, { firstMs: 80, stepMs: 250, holdMs: 80 });
    loginAs('ana', 'Ana', 100_000);
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    srv({ type: 'takeSeat', playerId: 'ana', seat: 1 });
    for (const s of [0, 1]) {
      srv({ type: 'setBet', playerId: 'ana', seat: s, kind: 'main', amount: 500 });
      srv({ type: 'confirmBets', playerId: 'ana', seat: s });
    }
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(await screen.findByText('Distribuir'));
    const shown = (sel: string) => container.querySelectorAll(`${sel} .card.deal-in`).length;
    await waitFor(() => expect(shown('[data-seat="1"]')).toBe(1));
    expect(shown('[aria-label="Dealer"]')).toBe(0);
    expect(shown('[data-seat="2"]')).toBe(0); // lugar 1 recebe primeiro, depois o 2
    await waitFor(() => expect(shown('[data-seat="2"]')).toBe(1));
    expect(shown('[aria-label="Dealer"]')).toBe(0);
    await waitFor(() => expect(shown('[aria-label="Dealer"]')).toBe(1)); // 1ª carta do dealer só depois dos lugares
    expect(shown('[data-seat="1"]')).toBe(1);
    await waitFor(() => expect(shown('[data-seat="1"]')).toBe(2));
  });
});
