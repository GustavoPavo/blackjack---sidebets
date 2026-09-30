/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TWENTY_THREE_PAYS, PAIR_PAYS, busterLuckyMultiplier, classify23Plus1, classifyPair, formatBRL, type PlayerStats, type RoundHistoryEntry,
} from '@bj/engine';
import { App } from '../src/App';
import { ACE_STRAIGHTS, EXAMPLES_23, EXAMPLES_PAIRS, NOT_A_PAIR, BUSTER_CARD_COUNTS, busterRows, engineAgrees } from '../src/ruleExamples';
import { tutorialStep } from '../src/tutorial';
import { ANIMATION } from '../src/usePresentation';
import { createFakeServer, type FakeServer } from './fakeServer';

let fake: FakeServer;
function start(shoe?: string[]) { fake = createFakeServer(shoe); vi.stubGlobal('fetch', fake.fetch); }
function loginAs(id: string, name: string, buyIn = 0, prefs: object = { tutorialSeen: true }) {
  const token = fake.addPlayer(id, name, buyIn);
  localStorage.setItem('bj.identity.v2', JSON.stringify({ id, name, token }));
  localStorage.setItem('bj.prefs.v1', JSON.stringify(prefs));
}
const srv = (c: Record<string, unknown>) => fake.srv(c);
let restore = { ...ANIMATION };
beforeEach(() => { localStorage.clear(); restore = { ...ANIMATION }; Object.assign(ANIMATION, { firstMs: 1, stepMs: 1, holdMs: 1 }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.assign(ANIMATION, restore); });

const dt = (label: string) => (c: string, el: Element | null) => el?.tagName === 'DT' && c === label;
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => { await user.click(await screen.findByRole('button', { name: 'Menu' })); return screen.getByRole('dialog', { name: 'Menu' }); };

describe('exemplos visuais das regras refletem exatamente o motor', () => {
  it('cada exemplo é classificado pelo motor na categoria indicada (23+1 e Pares)', () => {
    expect(engineAgrees()).toEqual({ c23: true, ace: true, pairs: true });
    for (const e of EXAMPLES_23) expect(classify23Plus1(e.player, e.dealer)).toBe(e.category);
    expect(EXAMPLES_23.map((e) => e.category)).toEqual(['suitedTrips', 'straightFlush', 'threeOfAKind', 'straight', 'flush']);
    for (const e of EXAMPLES_PAIRS) expect(classifyPair(e.cards[0], e.cards[1])).toBe(e.category);
    expect(classifyPair(NOT_A_PAIR[0], NOT_A_PAIR[1])).toBeNull();
  });
  it('sequências com Ás: só A-2-3 e Q-K-A; K-A-2 não vale', () => {
    const [a23, qka, ka2] = ACE_STRAIGHTS;
    expect(classify23Plus1(a23!.player, a23!.dealer)).toBe('straight');
    expect(classify23Plus1(qka!.player, qka!.dealer)).toBe('straight');
    expect(classify23Plus1(ka2!.player, ka2!.dealer)).not.toBe('straight');
    expect([a23!.valid, qka!.valid, ka2!.valid]).toEqual([true, true, false]);
  });
  it('razões e valores do Buster Lucky vêm do motor; lucro ≠ retorno total', () => {
    const rows = busterRows(250);
    expect(rows.map((r) => r.ratio)).toEqual(BUSTER_CARD_COUNTS.map((n) => busterLuckyMultiplier(n)));
    const r30 = rows.find((r) => r.ratio === 30)!;
    expect(r30.profit).toBe(7500); // lucro
    expect(r30.totalReturn).toBe(7750); // lucro + aposta devolvida
    expect(rows[5]).toMatchObject({ cards: 8, plus: true, ratio: 200 });
  });

  it('o modal mostra cartas de exemplo, pagamentos do motor e deixa claro que o valor é lucro', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText(/Regras e pagamentos/));
    const dialog = screen.getByRole('dialog', { name: 'Regras e pagamentos' });
    expect(dialog.textContent).toContain('O pagamento indicado (N:1) é o LUCRO');
    expect(dialog.textContent).toContain(`lucro de ${formatBRL(250 * 30)} e retorno total de ${formatBRL(250 * 31)}`);
    // 23+1
    const a23 = within(dialog).getByRole('article', { name: '23+1' });
    for (const e of EXAMPLES_23) {
      expect(a23.textContent).toContain(e.label);
      expect(a23.textContent).toContain(`${TWENTY_THREE_PAYS[e.category]}:1`);
      expect(a23.textContent).toContain(`lucro ${formatBRL(250 * e.ratio)} · retorno total ${formatBRL(250 * (e.ratio + 1))}`);
    }
    expect(within(a23).getAllByRole('img').length).toBe(5 * 3 + 3 * 3); // 5 combinações + 3 sequências com Ás, 3 cartas cada
    expect(within(a23).getByLabelText('Ás de espadas')).toBeTruthy();
    expect(a23.textContent).toMatch(/K-A-2 não vale/);
    // Pares
    const pares = within(dialog).getByRole('article', { name: 'Pares' });
    for (const e of EXAMPLES_PAIRS) expect(pares.textContent).toContain(`${PAIR_PAYS[e.category]}:1`);
    expect(pares.textContent).toMatch(/mesmo rank/);
    expect(within(pares).getAllByRole('img')).toHaveLength(3 * 2 + 2);
    // Buster Lucky
    const buster = within(dialog).getByRole('article', { name: 'Buster Lucky' });
    for (const n of BUSTER_CARD_COUNTS) expect(buster.textContent).toContain(`${busterLuckyMultiplier(n)}:1`);
    expect(buster.textContent).toContain('8 ou mais cartas');
    expect(buster.textContent).toContain(`lucro ${formatBRL(250 * 200)} · retorno total ${formatBRL(250 * 201)}`);
  });
});

describe('passo do tutorial (derivado do estado da sessão de demonstração)', () => {
  it('avança conforme o jogador aposta, adiciona side bet, confirma, distribui e decide', async () => {
    start();
    const token = fake.addPlayer('ana', 'Ana', 10_000);
    const auth = { authorization: `Bearer ${token}` };
    const get = async () => (await fake.fetch('/api/table?mode=demo', { headers: auth } as RequestInit)).json();
    const cmd = async (c: Record<string, unknown>) =>
      (await (await fake.fetch('/api/commands?mode=demo', { method: 'POST', headers: auth, body: JSON.stringify({ command: { id: `t-${Math.random()}`, ...c } }) })).json()).table;
    await (await fake.fetch('/api/sandbox/demo/start', { method: 'POST', headers: auth })).json();
    let v = await get();
    expect(tutorialStep(v, false)).toBe('chip');
    expect(tutorialStep(v, true)).toBe('main');
    v = await cmd({ type: 'setBet', seat: 0, kind: 'main', amount: 1000 });
    expect(tutorialStep(v, true)).toBe('side');
    v = await cmd({ type: 'setBet', seat: 0, kind: 'pairs', amount: 250 });
    expect(tutorialStep(v, true)).toBe('confirm');
    v = await cmd({ type: 'confirmBets', seat: 0 });
    expect(tutorialStep(v, true)).toBe('deal');
    v = await cmd({ type: 'deal' });
    expect(tutorialStep(v, true)).toBe('decide');
    expect(v.hint.action).toBe('double'); // 11 contra 6
    v = await cmd({ type: 'action', seat: 0, action: 'double' });
    expect(v.phase).toBe('SETTLEMENT');
    expect(tutorialStep(v, true)).toBe('done');
  });
});

describe('tutorial interativo em sessão separada', () => {
  it('oferta na primeira vez; "Pular" salva a preferência e não pergunta de novo', async () => {
    start(); loginAs('ana', 'Ana', 100_000, {});
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const offer = await screen.findByRole('dialog', { name: 'Tutorial rápido' });
    expect(offer.textContent).toMatch(/opcional/);
    expect(offer.textContent).toMatch(/não altera seu saldo nem seu histórico/);
    await user.click(within(offer).getByText('Pular'));
    expect(screen.queryByRole('dialog', { name: 'Tutorial rápido' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('bj.prefs.v1')!).tutorialSeen).toBe(true);
    await waitFor(() => expect(fake.prefs.get('ana')?.tutorialSeen).toBe(true));
    unmount();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    expect(screen.queryByRole('dialog', { name: 'Tutorial rápido' })).toBeNull();
  });

  it('percorre todos os passos sem alterar o saldo nem o histórico reais', async () => {
    start(); loginAs('ana', 'Ana', 100_000, {});
    const realBefore = { balance: fake.table.balanceOf('ana'), ledger: fake.table.players.get('ana')!.ledger.length, seats: fake.table.seats.map((s) => s.playerId) };
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(within(await screen.findByRole('dialog', { name: 'Tutorial rápido' })).getByText('Começar tutorial'));
    const coach = async () => (await screen.findByRole('region', { name: 'Tutorial' })).textContent ?? '';
    expect(await screen.findByText(/TUTORIAL/)).toBeTruthy();
    expect(screen.getByText('Saldo de demonstração')).toBeTruthy();
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 100,00');
    expect(await coach()).toMatch(/Passo 1 de 6.*Escolha uma ficha/);
    expect(container.querySelector('.tut-chip')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Ficha R$ 10,00' }));
    await waitFor(async () => expect(await coach()).toMatch(/Passo 2 de 6.*Aposte na principal/));
    const seat = screen.getByRole('region', { name: 'Lugar 1' });
    await user.click(within(seat).getByText('Principal'));
    await waitFor(async () => expect(await coach()).toMatch(/Passo 3 de 6.*side bet/));
    await user.click(within(seat).getByText('Pares'));
    await waitFor(async () => expect(await coach()).toMatch(/Passo 4 de 6.*Confirme/));
    await user.click(within(seat).getByText('Confirmar apostas'));
    await waitFor(async () => expect(await coach()).toMatch(/Passo 5 de 6.*Distribua/));
    await user.click(screen.getByText('Distribuir'));
    await waitFor(async () => expect(await coach()).toMatch(/Passo 6 de 6.*decisão/), { timeout: 5000 });
    // sugestão da estratégia na sessão de demonstração: 11 contra 6 → Dobrar
    expect((await screen.findByText(/Sugestão:/)).textContent).toMatch(/Dobrar/);
    await user.click(await screen.findByText('Dobrar (Double)'));
    await waitFor(async () => expect(await coach()).toMatch(/Pronto!/), { timeout: 6000 });
    expect(await coach()).toMatch(/seu saldo e seu histórico reais não mudaram/);

    // nada na mesa real: carteira, histórico e lugares iguais; todas as chamadas de jogo foram em modo demo
    expect(fake.table.balanceOf('ana')).toBe(realBefore.balance);
    expect(fake.table.players.get('ana')!.ledger).toHaveLength(realBefore.ledger);
    expect(fake.table.seats.map((s) => s.playerId)).toEqual(realBefore.seats);
    expect(fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/commands').every((c) => c.mode === 'demo')).toBe(true);

    await user.click(screen.getByText('Concluir'));
    await screen.findByRole('region', { name: 'Lugar 2' });
    expect(screen.queryByText(/TUTORIAL —/)).toBeNull();
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00'); // saldo real intacto
    expect(JSON.parse(localStorage.getItem('bj.prefs.v1')!).tutorialSeen).toBe(true);
  });

  it('pode ser pulado a qualquer momento e reaberto nas configurações', async () => {
    start(); loginAs('ana', 'Ana', 100_000, { tutorialSeen: true });
    const user = userEvent.setup();
    render(<App />);
    const menu = await openMenu(user);
    await user.click(within(menu).getByText('Configurações'));
    await user.click(within(menu).getByText('Abrir tutorial'));
    expect(await screen.findByText(/TUTORIAL/)).toBeTruthy();
    await user.click(await screen.findByText('Pular tutorial'));
    await screen.findByRole('region', { name: 'Lugar 2' });
    expect(screen.queryByRole('region', { name: 'Tutorial' })).toBeNull();
    expect(fake.table.balanceOf('ana')).toBe(100_000);
  });
});

describe('modo treino', () => {
  it('carteira própria, dicas com explicação e aviso; a mesa real não mostra dicas', async () => {
    start(['10S', '10D', '9H', '8C']); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    expect(container.querySelector('.hint')).toBeNull();
    await user.click(within(await openMenu(user)).getByText('Modo treino'));
    expect(await screen.findByText(/MODO TREINO/)).toBeTruthy();
    expect(screen.getByText('Saldo de treino')).toBeTruthy();
    expect(screen.queryByText('Editar nome')).toBeNull(); // o nome real não é editado no treino
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(within(seat).getByText('Principal'));
    await user.click(within(seat).getByText('Confirmar apostas'));
    await user.click(screen.getByText('Distribuir'));
    // jogador 19 contra 10: parar
    const hint = await screen.findByText(/Sugestão:/, {}, { timeout: 5000 });
    expect(hint.textContent).toMatch(/Parar/);
    const box = hint.closest('details')!;
    expect(box.textContent).toMatch(/valor esperado estimado/);
    expect(box.textContent).toMatch(/Não garante lucro/);
    expect(screen.getByText('Parar (Stand)').className).toMatch(/suggested/);
    // a carteira real não foi tocada
    expect(fake.table.balanceOf('ana')).toBe(100_000);
    expect(fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/commands').every((c) => c.mode === 'training')).toBe(true);
    // desliga as dicas (preferência salva)
    await user.click(within(box).getByText('Ocultar dicas'));
    expect(container.querySelector('.hint')).toBeNull();
    expect(JSON.parse(localStorage.getItem('bj.prefs.v1')!).trainingHints).toBe(false);
    expect(screen.getByText('Parar (Stand)').className).not.toMatch(/suggested/);
    // voltar à mesa real
    await user.click(screen.getByText('Voltar à mesa real'));
    await screen.findByRole('region', { name: 'Lugar 2' });
    expect(screen.getByLabelText('Saldo do jogador').textContent).toBe('R$ 1.000,00');
  });

  it('decisão apertada: informa que não há recomendação disponível (sem inventar)', async () => {
    // 10+2 = 12 contra 4 do dealer: parar e pedir estão empatados para a estimativa
    start(['10S', '4D', '2H', '8C']); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(within(await openMenu(user)).getByText('Modo treino'));
    const seat = await screen.findByRole('region', { name: 'Lugar 1' });
    await user.click(within(seat).getByText('Principal'));
    await user.click(within(seat).getByText('Confirmar apostas'));
    await user.click(screen.getByText('Distribuir'));
    const hint = await screen.findByText(/Sugestão:/, {}, { timeout: 5000 });
    expect(hint.textContent).toMatch(/sem recomendação disponível/);
    expect(hint.closest('details')!.textContent).toMatch(/Sem recomendação segura/);
    expect(document.querySelector('.act.suggested')).toBeNull();
  });

  it('o treino não tem estatísticas reais: o item do menu some', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    render(<App />);
    let menu = await openMenu(user);
    expect(within(menu).getByText('Estatísticas e histórico')).toBeTruthy();
    await user.click(within(menu).getByText('Modo treino'));
    await screen.findByText(/MODO TREINO/);
    menu = await openMenu(user);
    expect(within(menu).queryByText('Estatísticas e histórico')).toBeNull();
    expect(within(menu).getByText('Reiniciar treino')).toBeTruthy();
  });
});

describe('estatísticas e histórico', () => {
  const stats: PlayerStats = {
    rounds: 4, hands: 6, wins: 3, losses: 2, pushes: 1, naturals: 1, winRate: 0.5, stake: 10_000, returned: 11_500, net: 1500, creditsAdded: 100_000,
    byKind: {
      main: { count: 6, wins: 3, stake: 6000, returned: 7000, net: 1000 },
      twentyThree: { count: 4, wins: 0, stake: 1000, returned: 0, net: -1000 },
      pairs: { count: 4, wins: 1, stake: 1000, returned: 2750, net: 1750 },
      buster: { count: 2, wins: 0, stake: 500, returned: 0, net: -500 },
      insurance: { count: 1, wins: 0, stake: 500, returned: 0, net: -500 },
    },
  };
  const history: RoundHistoryEntry[] = [{
    roundId: 7, settledAt: '2026-09-29T15:30:00.000Z', dealer: [{ rank: '6', suit: 'S' }, { rank: '10', suit: 'C' }, { rank: 'K', suit: 'H' }], net: 1500,
    seats: [{
      seat: 0, number: 1, net: 1500,
      hands: [{ index: 0, cards: [{ rank: '8', suit: 'S' }, { rank: '10', suit: 'C' }], bet: 1000, doubled: false, fromSplit: true, status: 'stood' }, { index: 1, cards: [{ rank: '8', suit: 'D' }, { rank: '9', suit: 'C' }], bet: 1000, doubled: false, fromSplit: true, status: 'stood' }],
      results: [
        { kind: 'main', handIndex: 0, stake: 1000, payout: 2000, net: 1000, outcome: 'win', label: 'Dealer estourou' },
        { kind: 'main', handIndex: 1, stake: 1000, payout: 2000, net: 1000, outcome: 'win', label: 'Dealer estourou' },
        { kind: 'pairs', handIndex: null, stake: 250, payout: 1750, net: 1500, outcome: 'win', label: 'Red/Black Pair (6:1)' },
        { kind: 'twentyThree', handIndex: null, stake: 250, payout: 0, net: -250, outcome: 'lose', label: 'Sem combinação' },
      ],
    }],
  }];

  it('mostra totais, taxa de vitória definida, resultado por aposta e as últimas rodadas por lugar e mão', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    fake.setStats(stats, history);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await openMenu(user)).getByText('Estatísticas e histórico'));
    const sheet = await screen.findByRole('dialog', { name: 'Estatísticas e histórico' });
    await within(sheet).findByText(dt('Taxa de vitória'));
    const tile = (label: string) => within(sheet).getByText(dt(label)).closest('div')!.textContent!;
    expect(tile('Rodadas')).toContain('4');
    expect(tile('Mãos jogadas')).toContain('6');
    expect(tile('Blackjacks naturais')).toContain('1');
    expect(tile('Taxa de vitória')).toContain('50,0%');
    expect(tile('Resultado líquido acumulado')).toContain('+R$ 15,00');
    expect(tile('Total apostado')).toContain('R$ 100,00');
    expect(tile('Retorno total')).toContain('R$ 115,00');
    expect(sheet.textContent).toMatch(/Taxa de vitória.*vitórias ÷ mãos principais jogadas/s);
    expect(sheet.textContent).toMatch(/lucro líquido.*retorno total − valor apostado/s);
    expect(sheet.textContent).toMatch(/Buy-in e rebuy \(R\$ 1\.000,00 adicionados até agora\) não entram no resultado/);
    // resultado separado por aposta
    const row = (label: string) => within(sheet).getByRole('rowheader', { name: label }).closest('tr')!.textContent!;
    expect(row('Principal')).toContain('+R$ 10,00');
    expect(row('Pares')).toContain('+R$ 17,50');
    expect(row('23+1')).toContain('−R$ 10,00');
    expect(row('Buster Lucky')).toContain('−R$ 5,00');
    expect(row('Insurance')).toContain('−R$ 5,00');
    // histórico por lugar e mão (com split)
    const round = within(sheet).getByText(/Rodada #7/).closest('details')!;
    await user.click(within(round).getByText(/Rodada #7/));
    expect(round.textContent).toContain('+R$ 15,00');
    expect(round.textContent).toContain('Lugar 1');
    expect(round.textContent).toContain('Mão 1 (split)');
    expect(round.textContent).toContain('Mão 2 (split)');
    expect(within(round).getAllByRole('img').length).toBe(3 + 2 + 2);
    expect(round.textContent).toContain('Principal (mão 2): ganhou — Dealer estourou · +R$ 10,00');
    expect(round.textContent).toContain('Pares: ganhou — Red/Black Pair (6:1) · +R$ 15,00');
  });

  it('sem rodadas: mostra zeros e taxa de vitória indefinida', async () => {
    start(); loginAs('ana', 'Ana', 100_000);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await openMenu(user)).getByText('Estatísticas e histórico'));
    const sheet = await screen.findByRole('dialog', { name: 'Estatísticas e histórico' });
    await within(sheet).findByText(dt('Taxa de vitória'));
    expect(within(sheet).getByText(dt('Taxa de vitória')).closest('div')!.textContent).toContain('—');
    expect(sheet.textContent).toContain('Nenhuma rodada jogada ainda.');
  });
});
