import type { Card } from './cards';
import { handValue, type HandValue } from './hand';
import type { Cents } from './money';
import { roundMessage, type RoundMessage } from './roundMessage';
import { Table } from './table';
import {
  RULES, seatNumber, type Action, type BetKind, type BetResult, type HandStatus, type InsuranceDecision,
  type LedgerEntry, type Phase,
} from './types';

export interface HandView {
  cards: Card[];
  /** Ordem global de saque de cada carta (para animar a distribuição). */
  cardSeq: number[];
  bet: Cents;
  value: HandValue;
  status: HandStatus;
  doubled: boolean;
  fromSplit: boolean;
  active: boolean;
}

/** Um lugar da mesa. Não há carteira aqui: o saldo é do jogador (`PlayerView`). */
export interface SeatView {
  index: number; // 0..4
  number: number; // 1..5 (o que é exibido)
  playerId: string | null;
  playerName: string | null;
  mine: boolean;
  bets: Record<BetKind, Cents>;
  lastBets: Record<BetKind, Cents> | null;
  confirmed: boolean;
  insurance: { decision: InsuranceDecision | null; amount: Cents };
  hands: HandView[];
  results: BetResult[];
  canTake: boolean;
  canLeave: boolean;
  canEditBets: boolean;
  canConfirm: boolean;
  canRepeat: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  balance: Cents;
  ledger: LedgerEntry[];
  seats: number[]; // índices dos lugares ocupados
  canBuyIn: boolean; // buy-in inicial (uma vez)
  canRebuy: boolean;
}

export interface RoundSummaryItem { kind: BetResult['kind']; handIndex?: number; label: string; outcome: BetResult['outcome']; net: Cents }
export interface PlayerRoundSummary {
  playerId: string;
  name: string;
  net: Cents; // lucro líquido total: apostas principais, mãos de split, side bets e insurance de todos os lugares
  message: RoundMessage;
  seats: { seat: number; number: number; net: Cents; items: RoundSummaryItem[] }[];
}

export interface TableView {
  mode: 'local-simulation';
  phase: Phase;
  round: number;
  shoeRemaining: number;
  dealer: { cards: (Card | null)[]; cardSeq: number[]; value: HandValue | null; hasBlackjack: boolean | null };
  seats: SeatView[];
  me: PlayerView | null;
  turn: { seat: number; hand: number } | null;
  legalActions: Action[];
  canDeal: boolean;
  roundSummary: PlayerRoundSummary[];
  log: string[];
  rules: { minMain: Cents; minSide: Cents; maxBuy: Cents; maxSplits: number; seats: number };
}

export function buildRoundSummary(t: Table): PlayerRoundSummary[] {
  if (t.phase !== 'SETTLEMENT') return [];
  const byPlayer = new Map<string, PlayerRoundSummary>();
  for (const s of t.seats) {
    if (!s.playerId || s.hands.length === 0) continue;
    const p = t.players.get(s.playerId)!;
    const entry = byPlayer.get(p.id) ?? { playerId: p.id, name: p.name, net: 0, message: roundMessage(0), seats: [] };
    const items = s.results.map((r) => ({ kind: r.kind, handIndex: r.handIndex, label: r.label, outcome: r.outcome, net: r.net }));
    const net = items.reduce((a, i) => a + i.net, 0);
    entry.seats.push({ seat: s.index, number: seatNumber(s.index), net, items });
    entry.net += net;
    entry.message = roundMessage(entry.net);
    byPlayer.set(p.id, entry);
  }
  return [...byPlayer.values()];
}

/** Estado seguro para o cliente: esconde a carta fechada e o shoe, e traz o que a UI pode fazer. */
export function toView(t: Table, viewerId?: string): TableView {
  const betting = t.phase === 'BETTING';
  const turn = t.currentTurn();
  const d = t.dealer;
  const hidden = d.holeHidden;
  const active = t.seats.filter((s) => s.playerId && s.bets.main > 0);
  const viewer = viewerId ? t.players.get(viewerId) : undefined;
  const mySeats = viewer ? t.seatsOf(viewer.id) : [];
  const walletReady = !!viewer && viewer.ledger.length > 0;
  return {
    mode: 'local-simulation',
    phase: t.phase,
    round: t.round,
    shoeRemaining: t.shoe?.remaining ?? 0,
    dealer: {
      cards: d.cards.map((c, i) => (hidden && i === 1 ? null : c)),
      cardSeq: d.seq,
      value: d.cards.length && !hidden ? handValue(d.cards) : d.cards.length ? handValue([d.cards[0]!]) : null,
      hasBlackjack: d.cards.length && !hidden ? d.cards.length === 2 && handValue(d.cards).total === 21 : null,
    },
    seats: t.seats.map((s) => {
      const mine = !!viewer && s.playerId === viewer.id;
      return {
        index: s.index,
        number: seatNumber(s.index),
        playerId: s.playerId,
        playerName: s.playerId ? t.players.get(s.playerId)!.name : null,
        mine,
        bets: s.bets,
        lastBets: s.lastBets,
        confirmed: s.confirmed,
        insurance: { decision: s.insuranceDecision, amount: s.insurance },
        hands: s.hands.map((h, i) => ({
          cards: h.cards,
          cardSeq: h.seq,
          bet: h.bet,
          value: handValue(h.cards),
          status: h.status,
          doubled: h.doubled,
          fromSplit: h.fromSplit,
          active: !!turn && turn.seat === s && turn.index === i,
        })),
        results: s.results,
        canTake: betting && !s.playerId && walletReady,
        canLeave: betting && mine,
        canEditBets: betting && mine && !s.confirmed,
        canConfirm: betting && mine && !s.confirmed && s.bets.main >= RULES.minMain,
        canRepeat: betting && mine && !s.confirmed && !!s.lastBets,
      };
    }),
    me: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          balance: viewer.balance,
          ledger: viewer.ledger,
          seats: mySeats.map((s) => s.index),
          canBuyIn: betting && viewer.ledger.length === 0,
          canRebuy: betting && walletReady && !mySeats.some((s) => s.confirmed),
        }
      : null,
    turn: turn ? { seat: turn.seat.index, hand: turn.index } : null,
    legalActions: t.legalActions(),
    canDeal: betting && active.length > 0 && active.every((s) => s.confirmed),
    roundSummary: buildRoundSummary(t),
    log: t.log.slice(-30),
    rules: { minMain: RULES.minMain, minSide: RULES.minSide, maxBuy: RULES.maxBuy, maxSplits: RULES.maxSplits, seats: RULES.seats },
  };
}
