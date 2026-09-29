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

export interface Hand {
  cards: Card[];
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

export interface Seat {
  index: number;
  player: string | null;
  balance: Cents;
  ledger: LedgerEntry[];
  bets: Record<BetKind, Cents>;
  confirmed: boolean;
  insurance: Cents;
  insuranceDecision: InsuranceDecision | null;
  hands: Hand[];
  splits: number;
  results: BetResult[];
}

export type Command = { id: string } & (
  | { type: 'buyIn'; seat: number; amount: number; name?: string }
  | { type: 'rebuy'; seat: number; amount: number }
  | { type: 'leave'; seat: number }
  | { type: 'setBet'; seat: number; kind: BetKind; amount: number }
  | { type: 'clearBets'; seat: number }
  | { type: 'confirmBets'; seat: number }
  | { type: 'editBets'; seat: number }
  | { type: 'deal' }
  | { type: 'insurance'; seat: number; take: boolean }
  | { type: 'action'; seat: number; action: Action }
  | { type: 'nextRound' }
);

export type ErrorCode =
  | 'INVALID_COMMAND' | 'MISSING_COMMAND_ID' | 'WRONG_PHASE' | 'INVALID_SEAT' | 'SEAT_OCCUPIED'
  | 'SEAT_EMPTY' | 'INVALID_AMOUNT' | 'EXCEEDS_MAX_BUYIN' | 'BETS_CONFIRMED' | 'BETS_LOCKED'
  | 'BELOW_MIN_BET' | 'ODD_MAIN_BET' | 'NO_MAIN_BET' | 'INSUFFICIENT_FUNDS' | 'SEATS_NOT_CONFIRMED'
  | 'NO_BETS' | 'NOT_YOUR_TURN' | 'ILLEGAL_ACTION' | 'NO_INSURANCE_PENDING';

export type CommandResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; code: ErrorCode; message: string };

export class RuleError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}
