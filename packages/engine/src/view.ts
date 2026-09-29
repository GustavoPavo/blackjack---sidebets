import type { Card } from './cards';
import { handValue, type HandValue } from './hand';
import type { Cents } from './money';
import { Table } from './table';
import {
  RULES, type Action, type BetKind, type BetResult, type HandStatus, type InsuranceDecision,
  type LedgerEntry, type Phase,
} from './types';

export interface HandView {
  cards: Card[];
  bet: Cents;
  value: HandValue;
  status: HandStatus;
  doubled: boolean;
  fromSplit: boolean;
  active: boolean;
}
export interface SeatView {
  index: number;
  player: string | null;
  balance: Cents;
  ledger: LedgerEntry[];
  bets: Record<BetKind, Cents>;
  confirmed: boolean;
  insurance: { decision: InsuranceDecision | null; amount: Cents };
  hands: HandView[];
  results: BetResult[];
  canBuyIn: boolean;
  canRebuy: boolean;
  canEditBets: boolean;
  canConfirm: boolean;
}
export interface TableView {
  mode: 'local-simulation';
  phase: Phase;
  round: number;
  shoeRemaining: number;
  dealer: { cards: (Card | null)[]; value: HandValue | null; hasBlackjack: boolean | null };
  seats: SeatView[];
  turn: { seat: number; hand: number } | null;
  legalActions: Action[];
  canDeal: boolean;
  log: string[];
  rules: { minMain: Cents; minSide: Cents; maxBuy: Cents; maxSplits: number; seats: number };
}

/** Estado seguro para o cliente: esconde a carta fechada e o shoe, e traz o que a UI pode fazer. */
export function toView(t: Table): TableView {
  const betting = t.phase === 'BETTING';
  const turn = t.currentTurn();
  const d = t.dealer;
  const hidden = d.holeHidden;
  const active = t.seats.filter((s) => s.player && s.bets.main > 0);
  return {
    mode: 'local-simulation',
    phase: t.phase,
    round: t.round,
    shoeRemaining: t.shoe?.remaining ?? 0,
    dealer: {
      cards: d.cards.map((c, i) => (hidden && i === 1 ? null : c)),
      value: d.cards.length && !hidden ? handValue(d.cards) : d.cards.length ? handValue([d.cards[0]!]) : null,
      hasBlackjack: d.cards.length && !hidden ? d.cards.length === 2 && handValue(d.cards).total === 21 : null,
    },
    seats: t.seats.map((s) => ({
      index: s.index,
      player: s.player,
      balance: s.balance,
      ledger: s.ledger,
      bets: s.bets,
      confirmed: s.confirmed,
      insurance: { decision: s.insuranceDecision, amount: s.insurance },
      hands: s.hands.map((h, i) => ({
        cards: h.cards,
        bet: h.bet,
        value: handValue(h.cards),
        status: h.status,
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        active: !!turn && turn.seat === s && turn.index === i,
      })),
      results: s.results,
      canBuyIn: betting && !s.player,
      canRebuy: betting && !!s.player && !s.confirmed,
      canEditBets: betting && !!s.player && !s.confirmed,
      canConfirm: betting && !!s.player && !s.confirmed && s.bets.main >= RULES.minMain,
    })),
    turn: turn ? { seat: turn.seat.index, hand: turn.index } : null,
    legalActions: t.legalActions(),
    canDeal: betting && active.length > 0 && active.every((s) => s.confirmed),
    log: t.log.slice(-30),
    rules: { minMain: RULES.minMain, minSide: RULES.minSide, maxBuy: RULES.maxBuy, maxSplits: RULES.maxSplits, seats: RULES.seats },
  };
}
