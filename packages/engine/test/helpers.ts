import { Table, Shoe, type Card, type Rank, type Suit, type Command } from '../src';

/** 'AS' 'KH' '10D' → Card. */
export function c(code: string): Card {
  return { rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit };
}
export const cards = (...codes: string[]) => codes.map(c);

type DistOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
type Cmd = DistOmit<Command, 'id'> & { id?: string };
let n = 0;
export const id = () => `cmd-${++n}`;

export function mkTable(sequence: string[]) {
  const t = new Table({ shoeFactory: () => Shoe.stacked(cards(...sequence)), reshuffleBelow: 0 });
  const run = (cmd: Cmd) => t.dispatch({ id: id(), ...cmd } as Command);
  const ok = (cmd: Cmd) => {
    const r = run(cmd);
    if (!r.ok) throw new Error(`${cmd.type} falhou: ${r.code} ${r.message}`);
    return r;
  };
  return { t, run, ok };
}

/** Senta o lugar com buy-in, aposta e confirma. */
export function sit(h: ReturnType<typeof mkTable>, seat: number, buy: number, bets: Partial<Record<'main' | 'twentyThree' | 'pairs' | 'buster', number>>) {
  h.ok({ type: 'buyIn', seat, amount: buy });
  for (const [kind, amount] of Object.entries(bets)) h.ok({ type: 'setBet', seat, kind: kind as any, amount: amount! });
  h.ok({ type: 'confirmBets', seat });
}
