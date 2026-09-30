import { Table, Shoe, type Card, type Rank, type Suit, type Command, type BetKind } from '../src';

/** 'AS' 'KH' '10D' → Card. */
export function c(code: string): Card {
  return { rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit };
}
export const cards = (...codes: string[]) => codes.map(c);

type Loose<T> = T extends unknown ? Omit<T, 'id' | 'playerId'> & { id?: string; playerId?: string } : never;
type Cmd = Loose<Command>;
let n = 0;
export const id = () => `cmd-${++n}`;

/** Jogador padrão do lugar i nos testes: "P{i}" (um jogador por lugar, salvo nos testes de carteira compartilhada). */
export const pid = (seat: number) => `P${seat}`;

export function mkTable(sequence: string[]) {
  const t = new Table({ shoeFactory: () => Shoe.stacked(cards(...sequence)), reshuffleBelow: 0 });
  const run = (cmd: Cmd) => {
    const anyCmd = cmd as any;
    let playerId = anyCmd.playerId as string | undefined;
    if (playerId === undefined) {
      if (typeof anyCmd.seat === 'number') playerId = t.seats[anyCmd.seat]?.playerId ?? pid(anyCmd.seat);
      else playerId = [...t.players.keys()][0] ?? 'P0';
    }
    return t.dispatch({ id: id(), ...anyCmd, playerId } as Command);
  };
  const ok = (cmd: Cmd) => {
    const r = run(cmd);
    if (!r.ok) throw new Error(`${cmd.type} falhou: ${r.code} ${r.message}`);
    return r;
  };
  /** Saldo (carteira) do jogador que ocupa o lugar. */
  const bal = (seat: number) => t.playerAt(seat)?.balance ?? 0;
  return { t, run, ok, bal };
}
export type Harness = ReturnType<typeof mkTable>;

/** Cria o jogador (nome + buy-in inicial), sem sentá-lo. */
export function join(h: Harness, playerId: string, buy: number, name = playerId) {
  h.ok({ type: 'setName', playerId, name });
  h.ok({ type: 'buyIn', playerId, amount: buy });
}
/** Jogador P{seat} entra, faz buy-in e ocupa o lugar. */
export function seatPlayer(h: Harness, seat: number, buy: number) {
  join(h, pid(seat), buy, `Jogador ${seat + 1}`);
  h.ok({ type: 'takeSeat', playerId: pid(seat), seat });
}
export function bet(h: Harness, seat: number, bets: Partial<Record<BetKind, number>>) {
  for (const [kind, amount] of Object.entries(bets)) h.ok({ type: 'setBet', seat, kind: kind as BetKind, amount: amount! });
}

/** Senta o lugar com buy-in, aposta e confirma. */
export function sit(h: Harness, seat: number, buy: number, bets: Partial<Record<BetKind, number>>) {
  seatPlayer(h, seat, buy);
  bet(h, seat, bets);
  h.ok({ type: 'confirmBets', seat });
}
