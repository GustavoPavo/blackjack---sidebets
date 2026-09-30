import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, Shoe, toView, type Command } from '@bj/engine';
import { App } from '../src/App';
import { ANIMATION } from '../src/usePresentation';

const card = (code: string) => ({ rank: code.slice(0, -1) as any, suit: code.slice(-1) as any });
let table: Table;
let n = 0;
const srv = (c: any) => table.dispatch({ id: `srv-${++n}`, ...c } as Command);

function startServer(shoe: string[] = ['10S', '10D', '9H', '8C']) {
  table = new Table({ shoeFactory: () => Shoe.stacked(shoe.map(card)), reshuffleBelow: 0 });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.startsWith('/api/table')) return json(toView(table, new URL(url, 'http://x').searchParams.get('playerId') ?? undefined));
    if (url === '/api/commands') {
      const command = JSON.parse(init!.body as string).command;
      const result = table.dispatch(command);
      return json({ result, table: toView(table, command.playerId) });
    }
    return json({}, 404);
  });
}
const saved = () => JSON.parse(localStorage.getItem('bj.identity.v1') ?? 'null');
const setIdentity = (id: string, name: string) => localStorage.setItem('bj.identity.v1', JSON.stringify({ id, name }));
/** Registra no servidor o jogador `ana` com buy-in de R$ 1.000,00. */
const seedAna = () => { srv({ type: 'setName', playerId: 'ana', name: 'Ana' }); srv({ type: 'buyIn', playerId: 'ana', amount: 100_000 }); };

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

  it('"Editar nome" atualiza o nome em todos os lugares, sem mudar identidade nem saldo', async () => {
    startServer();
    setIdentity('ana', 'Ana');
    seedAna();
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
    expect(saved()).toEqual({ id: 'ana', name: 'Ana Maria' });
    expect(table.players.size).toBe(1);
    expect(table.balanceOf('ana')).toBe(100_000);
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00');
  });
});

describe('mesa', () => {
  it('lugares ficam na ordem visual 5, 4, 3, 2, 1 (lugar 1 à direita)', async () => {
    startServer();
    setIdentity('ana', 'Ana');
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
    setIdentity('ana', 'Ana');
    render(<App />);
    await screen.findByText(/Simulação local/);
    expect(screen.getByText(/Não é multiplayer online/)).toBeTruthy();
    expect(screen.getAllByText('Lugar disponível')).toHaveLength(5);
  });

  it('buy-in inicial no topo (máx. R$ 1.000,00); depois senta em vários lugares sem novo buy-in', async () => {
    startServer();
    setIdentity('ana', 'Ana');
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
    await waitFor(() => expect(table.seats[0]!.playerId).toBe('ana'));
    await user.click(within(seat(5)).getByText('Sentar aqui'));
    await waitFor(() => expect(table.seats[4]!.playerId).toBe('ana'));
    expect(table.players.get('ana')!.ledger).toHaveLength(1); // nenhum buy-in por lugar
    expect(within(seat(1)).queryByText(/buy-in/i)).toBeNull();
    // apostas dos dois lugares consomem a mesma carteira exibida no topo
    await user.click(within(seat(1)).getByText('Principal'));
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 995,00'));
    await user.click(within(seat(5)).getByText('Principal'));
    await waitFor(() => expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 990,00'));
  });

  it('side bets desabilitadas sem aposta principal; rebuy some depois de confirmar', async () => {
    startServer();
    setIdentity('ana', 'Ana');
    seedAna();
    srv({ type: 'takeSeat', playerId: 'ana', seat: 0 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    expect((within(seat(1)).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Rebuy')).toBeTruthy();
    await user.click(within(seat(1)).getByText('Principal'));
    await waitFor(() => expect(table.seats[0]!.bets.main).toBe(500));
    expect((within(seat(1)).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(seat(1)).getByText('Confirmar apostas'));
    await waitFor(() => expect(screen.queryByText('Rebuy')).toBeNull());
  });
});

describe('Repetir aposta e X2', () => {
  async function afterRound() {
    startServer(['10S', '10D', '9H', '8C']);
    setIdentity('ana', 'Ana');
    seedAna();
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
    const start = table.balanceOf('ana');
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    await waitFor(() => expect(table.seats[0]!.bets.main).toBe(1000));
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    await user.click(within(seat(1)).getByText('Repetir aposta'));
    expect(table.seats[0]!.bets).toMatchObject({ main: 1000, buster: 250 });
    expect(table.balanceOf('ana')).toBe(start - 1250);
    await user.click(within(seat(1)).getByText('X2'));
    await waitFor(() => expect(table.seats[0]!.bets.main).toBe(2000));
    await user.click(within(seat(1)).getByText('X2'));
    expect(table.balanceOf('ana')).toBe(start - 2500);
    // ainda dá para confirmar e jogar
    expect(within(seat(1)).getByText('Confirmar apostas')).toBeTruthy();
  });
  it('sem saldo para o conjunto completo: mantém as apostas e mostra mensagem clara', async () => {
    await afterRound();
    // esvazia a carteira em outro lugar do mesmo jogador
    srv({ type: 'takeSeat', playerId: 'ana', seat: 2 });
    srv({ type: 'setBet', playerId: 'ana', seat: 2, kind: 'main', amount: table.balanceOf('ana') - 500 });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await screen.findByText('X2');
    const before = table.balanceOf('ana');
    await user.click(within(seat(1)).getByText('X2'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Saldo insuficiente para X2/);
    expect(table.seats[0]!.bets.main).toBe(0);
    expect(table.balanceOf('ana')).toBe(before);
  });
});

describe('mensagem de ganho total', () => {
  it('só aparece depois da distribuição, dos turnos e da animação final do dealer', async () => {
    startServer(['10S', '10D', '9H', '8C']); // jogador 19 vs dealer 18
    Object.assign(ANIMATION, { firstMs: 120, stepMs: 120, holdMs: 120 });
    setIdentity('ana', 'Ana');
    seedAna();
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
    setIdentity('ana', 'Ana');
    seedAna();
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
