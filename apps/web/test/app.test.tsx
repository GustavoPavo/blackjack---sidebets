import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, toView } from '@bj/engine';
import { App } from '../src/App';

let table: Table;
beforeEach(() => {
  table = new Table();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url === '/api/table') return json(toView(table));
    if (url === '/api/commands') {
      const result = table.dispatch(JSON.parse(init!.body as string).command);
      return json({ result, table: toView(table) });
    }
    return json({}, 404);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const seat = (n: number) => screen.getByRole('region', { name: `Lugar ${n}` });

describe('App', () => {
  it('mostra 5 lugares disponíveis e avisa que é simulação local', async () => {
    render(<App />);
    await screen.findByText(/Simulação local/);
    expect(screen.getByText(/Não é multiplayer online/)).toBeTruthy();
    expect(screen.getAllByText('Lugar disponível')).toHaveLength(5);
  });

  it('buy-in: bloqueia acima de R$ 1.000,00 e senta com valor válido', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByText('Lugar disponível');
    await user.click(within(seat(1)).getByText('Sentar (buy-in)'));
    const input = within(seat(1)).getByLabelText('Valor em reais');
    await user.clear(input);
    await user.type(input, '1500');
    expect(within(seat(1)).getByRole('alert').textContent).toMatch(/Máximo R\$ 1\.000,00/);
    expect((within(seat(1)).getByText('Confirmar buy-in') as HTMLButtonElement).disabled).toBe(true);
    await user.clear(input);
    await user.type(input, '1000');
    await user.click(within(seat(1)).getByText('Confirmar buy-in'));
    await waitFor(() => expect(within(seat(1)).getByLabelText('Saldo do lugar 1').textContent).toBe('R$ 1.000,00'));
    expect(table.seats[0]!.ledger).toHaveLength(1);
    expect(within(seat(1)).getByText(/Histórico de créditos \(1\)/)).toBeTruthy();
  });

  it('rebuy só antes de confirmar; side bets desabilitadas sem aposta principal', async () => {
    const user = userEvent.setup();
    table.dispatch({ id: 'x', type: 'buyIn', seat: 0, amount: 100000, name: 'Ana' });
    render(<App />);
    await screen.findByText('Ana');
    const s = seat(1);
    expect((within(s).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(within(s).getByText('Rebuy')).toBeTruthy();
    await user.click(within(s).getByText('Principal'));
    await waitFor(() => expect(table.seats[0]!.bets.main).toBe(500));
    expect((within(seat(1)).getByText('23+1').closest('button') as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(seat(1)).getByText('Confirmar apostas'));
    await waitFor(() => expect(within(seat(1)).queryByText('Rebuy')).toBeNull());
  });
});
