import type { Card } from './cards';
import type { Cents } from './money';

export const RULES = {
  seats: 5,
  decks: 6,
  minMain: 500,
  minSide: 250,
  maxBuy: 100_000,
  maxSplits: 3, // até 4 mãos
  /** Reembaralha no início da rodada se restarem menos cartas que isso. */
  reshuffleBelow: 78,
  /** Regra de split ainda não confirmada pelo dono da mesa: 'value' = qualquer par de mesmo valor (10/J/Q/K). */
  splitBy: 'value' as 'value' | 'rank',
} as const;

export type Phase = 'BETTING' | 'DEALING' | 'INSURANCE' | 'PLAYER_TURNS' | 'DEALER_TURN' | 'SETTLEMENT';
export type BetKind = 'main' | 'twentyThree' | 'pairs' | 'buster';
export const BET_KINDS: BetKind[] = ['main', 'twentyThree', 'pairs', 'buster'];
export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender';
export const ACTIONS: Action[] = ['hit', 'stand', 'double', 'split', 'surrender'];
export type HandStatus = 'playing' | 'stood' | 'busted' | 'surrendered' | 'blackjack';

/**
 * Vocabulário: "lugar" (Seat) é uma das 5 posições da mesa; "mão" (Hand) é uma mão jogada num lugar
 * (um lugar tem 1 mão, ou até 4 após splits); "jogador" (Player) é a pessoa dona da carteira.
 * `Seat.index` é 0..4 (interno); o número exibido do lugar é `seatNumber(index)` = 1..5.
 */
export const seatNumber = (seatIndex: number) => seatIndex + 1;

export interface Hand {
  cards: Card[];
  /** Ordem global de saque de cada carta (mesma posição de `cards`); usado para animar a distribuição. */
  seq: number[];
  bet: Cents;
  doubled: boolean;
  fromSplit: boolean;
  fromAces: boolean;
  status: HandStatus;
}

export interface LedgerEntry {
  commandId: string;
  type: 'buyIn' | 'rebuy';
  amount: Cents;
  at: string;
  balanceAfter: Cents;
}

export type ResultKind = BetKind | 'insurance';
export interface BetResult {
  kind: ResultKind;
  handIndex?: number;
  stake: Cents;
  payout: Cents; // retorno total creditado (0 se perdeu)
  net: Cents;
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';
  label: string;
}

export type InsuranceDecision = 'pending' | 'taken' | 'declined';

/** Jogador: identidade estável (id) + carteira única, compartilhada por todos os lugares que ele ocupa. */
export interface Player {
  id: string;
  name: string;
  balance: Cents;
  ledger: LedgerEntry[];
}

export interface Seat {
  index: number;
  playerId: string | null;
  bets: Record<BetKind, Cents>;
  /** Configuração inicial de apostas da última rodada jogada neste lugar (não inclui Double/Split/Insurance). */
  lastBets: Record<BetKind, Cents> | null;
  confirmed: boolean;
  insurance: Cents;
  insuranceDecision: InsuranceDecision | null;
  hands: Hand[];
  splits: number;
  results: BetResult[];
}

export type Command = { id: string } & (
  | { type: 'setName'; playerId: string; name: string }
  | { type: 'buyIn'; playerId: string; amount: number }
  | { type: 'rebuy'; playerId: string; amount: number }
  | { type: 'takeSeat'; playerId: string; seat: number }
  | { type: 'leave'; playerId: string; seat: number }
  | { type: 'setBet'; playerId: string; seat: number; kind: BetKind; amount: number }
  | { type: 'repeatBets'; playerId: string; seat: number; multiplier: 1 | 2 }
  | { type: 'clearBets'; playerId: string; seat: number }
  | { type: 'confirmBets'; playerId: string; seat: number }
  | { type: 'editBets'; playerId: string; seat: number }
  | { type: 'deal'; playerId: string }
  | { type: 'insurance'; playerId: string; seat: number; take: boolean }
  | { type: 'action'; playerId: string; seat: number; action: Action }
  | { type: 'nextRound'; playerId: string }
);

export type ErrorCode =
  | 'INVALID_COMMAND' | 'MISSING_COMMAND_ID' | 'WRONG_PHASE' | 'INVALID_SEAT' | 'SEAT_OCCUPIED'
  | 'SEAT_EMPTY' | 'INVALID_AMOUNT' | 'EXCEEDS_MAX_BUYIN' | 'BETS_CONFIRMED' | 'BETS_LOCKED'
  | 'BELOW_MIN_BET' | 'ODD_MAIN_BET' | 'NO_MAIN_BET' | 'INSUFFICIENT_FUNDS' | 'SEATS_NOT_CONFIRMED'
  | 'NO_BETS' | 'NOT_YOUR_TURN' | 'ILLEGAL_ACTION' | 'NO_INSURANCE_PENDING'
  | 'INVALID_PLAYER' | 'UNKNOWN_PLAYER' | 'INVALID_NAME' | 'ALREADY_BOUGHT_IN' | 'NO_WALLET' | 'NO_BUYIN'
  | 'NOT_SEAT_OWNER' | 'NO_PREVIOUS_BETS' | 'INVALID_MULTIPLIER';

export type CommandResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; code: ErrorCode; message: string };

export class RuleError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}
