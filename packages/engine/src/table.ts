import type { Card } from './cards';
import { handValue, isTwoCardBlackjack } from './hand';
import { cardValue } from './cards';
import { settleBusterLucky } from './busterLucky';
import { settle23Plus1, settlePairs } from './sideBets';
import { validateBuyAmount, formatBRL, type Cents } from './money';
import { Shoe, type Rng } from './shoe';
import {
  ACTIONS, BET_KINDS, RULES, RuleError,
  type Action, type BetKind, type BetResult, type Command, type CommandResult, type Hand,
  type Phase, type ResultKind, type Seat,
} from './types';

export interface TableOptions {
  rng?: Rng;
  shoeFactory?: () => Shoe;
  now?: () => Date;
  reshuffleBelow?: number;
}

const emptyBets = (): Record<BetKind, Cents> => ({ main: 0, twentyThree: 0, pairs: 0, buster: 0 });
const newSeat = (index: number): Seat => ({
  index, player: null, balance: 0, ledger: [], bets: emptyBets(), confirmed: false,
  insurance: 0, insuranceDecision: null, hands: [], splits: 0, results: [],
});

/**
 * Mesa de 5 lugares + dealer compartilhado. Autoridade única sobre baralho, turnos, saldos e
 * pagamentos. Todas as mutações passam por `dispatch`, que valida antes de alterar o estado e
 * ignora comandos repetidos (mesmo `id`).
 *
 * Fluxo: BETTING → DEALING → (INSURANCE) → PLAYER_TURNS → DEALER_TURN → SETTLEMENT → BETTING.
 * DEALING e DEALER_TURN são transitórios (executam dentro de um único comando).
 *
 * Regras de liquidação (Ver docs/RULES.md):
 *  - 23+1 e Pares: logo após a distribuição.
 *  - Insurance: quando o dealer revela a carta fechada (mesa sem "peek").
 *  - Buster Lucky e mãos principais: fim do turno do dealer.
 */
export class Table {
  phase: Phase = 'BETTING';
  round = 1;
  seats: Seat[] = Array.from({ length: RULES.seats }, (_, i) => newSeat(i));
  dealer: { cards: Card[]; holeHidden: boolean } = { cards: [], holeHidden: false };
  shoe: Shoe | null = null;
  log: string[] = [];
  private processed = new Map<string, CommandResult>();
  private rng: Rng;
  private shoeFactory: () => Shoe;
  private now: () => Date;
  private reshuffleBelow: number;

  constructor(opts: TableOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.shoeFactory = opts.shoeFactory ?? (() => Shoe.fresh(this.rng, RULES.decks));
    this.now = opts.now ?? (() => new Date());
    this.reshuffleBelow = opts.reshuffleBelow ?? RULES.reshuffleBelow;
  }

  // ------------------------------------------------------------ comandos
  dispatch(cmd: Command): CommandResult {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.id !== 'string' || cmd.id.length === 0)
      return { ok: false, code: 'MISSING_COMMAND_ID', message: 'Comando sem id.' };
    const prev = this.processed.get(cmd.id);
    if (prev) return { ...prev, duplicate: true } as CommandResult;
    let res: CommandResult;
    try {
      this.handle(cmd);
      res = { ok: true };
      this.processed.set(cmd.id, res);
    } catch (e) {
      if (e instanceof RuleError) res = { ok: false, code: e.code, message: e.message };
      else throw e;
    }
    return res;
  }

  private handle(cmd: Command) {
    switch (cmd.type) {
      case 'buyIn': return this.buy(cmd.id, cmd.seat, cmd.amount, false, cmd.name);
      case 'rebuy': return this.buy(cmd.id, cmd.seat, cmd.amount, true);
      case 'leave': return this.leave(cmd.seat);
      case 'setBet': return this.setBet(cmd.seat, cmd.kind, cmd.amount);
      case 'clearBets': return this.clearBets(cmd.seat);
      case 'confirmBets': return this.confirm(cmd.seat, true);
      case 'editBets': return this.confirm(cmd.seat, false);
      case 'deal': return this.deal();
      case 'insurance': return this.insurance(cmd.seat, cmd.take);
      case 'action': return this.act(cmd.seat, cmd.action);
      case 'nextRound': return this.nextRound();
      default: throw new RuleError('INVALID_COMMAND', 'Comando desconhecido.');
    }
  }

  // ------------------------------------------------------------ helpers
  private seat(i: unknown): Seat {
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= RULES.seats)
      throw new RuleError('INVALID_SEAT', 'Lugar inválido.');
    return this.seats[i]!;
  }
  private occupied(i: unknown): Seat {
    const s = this.seat(i);
    if (!s.player) throw new RuleError('SEAT_EMPTY', 'Lugar vazio.');
    return s;
  }
  private need(phase: Phase) {
    if (this.phase !== phase) throw new RuleError('WRONG_PHASE', `Ação indisponível na fase ${this.phase}.`);
  }
  private say(msg: string) {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
  }
  private credit(seat: Seat, amount: Cents) { seat.balance += amount; }
  private record(seat: Seat, r: Omit<BetResult, 'net'>) {
    seat.results.push({ ...r, net: r.payout - r.stake });
  }

  // ------------------------------------------------------------ buy-in / rebuy
  private buy(commandId: string, i: number, amount: number, rebuy: boolean, name?: string) {
    this.need('BETTING');
    const s = this.seat(i);
    const bad = validateBuyAmount(amount);
    if (rebuy) {
      if (!s.player) throw new RuleError('SEAT_EMPTY', 'Rebuy só é possível em lugar ocupado.');
      if (s.confirmed) throw new RuleError('BETS_CONFIRMED', 'Rebuy não é permitido após confirmar as apostas.');
    } else if (s.player) throw new RuleError('SEAT_OCCUPIED', 'Lugar já ocupado.');
    if (bad === 'INVALID_AMOUNT') throw new RuleError('INVALID_AMOUNT', 'Valor deve ser um inteiro positivo em centavos.');
    if (bad === 'EXCEEDS_MAX_BUYIN')
      throw new RuleError('EXCEEDS_MAX_BUYIN', `Máximo de ${formatBRL(RULES.maxBuy)} por operação.`);
    if (!rebuy) {
      const n = typeof name === 'string' ? name.trim().slice(0, 20) : '';
      s.player = n || `Jogador ${i + 1}`;
    }
    s.balance += amount;
    s.ledger.push({
      commandId, type: rebuy ? 'rebuy' : 'buyIn', amount, at: this.now().toISOString(), balanceAfter: s.balance,
    });
    this.say(`${s.player}: ${rebuy ? 'rebuy' : 'buy-in'} de ${formatBRL(amount)} (créditos fictícios).`);
  }

  /** Libera o lugar. Os créditos são fictícios: não há saque, o saldo é descartado. */
  private leave(i: number) {
    this.need('BETTING');
    const s = this.occupied(i);
    this.refundBets(s, BET_KINDS);
    this.say(`${s.player} deixou o lugar ${i + 1}.`);
    this.seats[i] = newSeat(i);
  }

  // ------------------------------------------------------------ apostas
  private refundBets(s: Seat, kinds: BetKind[]) {
    for (const k of kinds) { s.balance += s.bets[k]; s.bets[k] = 0; }
  }

  private setBet(i: number, kind: BetKind, amount: number) {
    this.need('BETTING');
    const s = this.occupied(i);
    if (!BET_KINDS.includes(kind)) throw new RuleError('INVALID_COMMAND', 'Tipo de aposta inválido.');
    if (s.confirmed) throw new RuleError('BETS_LOCKED', 'Apostas confirmadas: edite antes de alterar.');
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)
      throw new RuleError('INVALID_AMOUNT', 'Valor inválido.');
    if (amount === 0) {
      // Retirar a principal cancela e devolve as side bets.
      this.refundBets(s, kind === 'main' ? BET_KINDS : [kind]);
      return;
    }
    if (kind === 'main') {
      if (amount < RULES.minMain) throw new RuleError('BELOW_MIN_BET', `Aposta principal mínima: ${formatBRL(RULES.minMain)}.`);
      if (amount % 2 !== 0) throw new RuleError('ODD_MAIN_BET', 'A aposta principal deve ter centavos pares (para pagar 3:2 e metade exatos).');
    } else {
      if (s.bets.main <= 0) throw new RuleError('NO_MAIN_BET', 'Side bets exigem uma aposta principal válida no mesmo lugar.');
      if (amount < RULES.minSide) throw new RuleError('BELOW_MIN_BET', `Side bet mínima: ${formatBRL(RULES.minSide)}.`);
    }
    const delta = amount - s.bets[kind];
    if (delta > s.balance) throw new RuleError('INSUFFICIENT_FUNDS', 'Saldo insuficiente.');
    s.balance -= delta;
    s.bets[kind] = amount;
  }

  private clearBets(i: number) {
    this.need('BETTING');
    const s = this.occupied(i);
    if (s.confirmed) throw new RuleError('BETS_LOCKED', 'Apostas confirmadas: edite antes de limpar.');
    this.refundBets(s, BET_KINDS);
  }

  private confirm(i: number, value: boolean) {
    this.need('BETTING');
    const s = this.occupied(i);
    if (value && s.bets.main < RULES.minMain)
      throw new RuleError('NO_MAIN_BET', 'Faça uma aposta principal válida antes de confirmar.');
    s.confirmed = value;
  }

  // ------------------------------------------------------------ distribuição
  private deal() {
    this.need('BETTING');
    const active = this.seats.filter((s) => s.player && s.bets.main > 0);
    if (active.some((s) => !s.confirmed)) throw new RuleError('SEATS_NOT_CONFIRMED', 'Há lugares com apostas não confirmadas.');
    if (active.length === 0) throw new RuleError('NO_BETS', 'Nenhuma aposta confirmada.');

    if (!this.shoe || this.shoe.remaining < this.reshuffleBelow) {
      this.shoe = this.shoeFactory();
      this.say('Novo shoe de 6 baralhos embaralhado.');
    }
    const shoe = this.shoe;
    this.phase = 'DEALING';
    for (const s of active) {
      s.hands = [{ cards: [], bet: s.bets.main, doubled: false, fromSplit: false, fromAces: false, status: 'playing' }];
    }
    for (const s of active) s.hands[0]!.cards.push(shoe.draw());
    const up = shoe.draw();
    for (const s of active) s.hands[0]!.cards.push(shoe.draw());
    const hole = shoe.draw();
    this.dealer = { cards: [up, hole], holeHidden: true };

    for (const s of active) {
      const h = s.hands[0]!;
      if (isTwoCardBlackjack(h.cards)) h.status = 'blackjack';
      const pc = h.cards as [Card, Card];
      if (s.bets.twentyThree > 0) {
        const r = settle23Plus1(s.bets.twentyThree, pc, up);
        this.credit(s, r.payout);
        this.record(s, { kind: 'twentyThree', stake: s.bets.twentyThree, payout: r.payout, outcome: r.won ? 'win' : 'lose', label: r.label });
      }
      if (s.bets.pairs > 0) {
        const r = settlePairs(s.bets.pairs, pc[0], pc[1]);
        this.credit(s, r.payout);
        this.record(s, { kind: 'pairs', stake: s.bets.pairs, payout: r.payout, outcome: r.won ? 'win' : 'lose', label: r.label });
      }
    }
    this.say(`Rodada ${this.round}: cartas distribuídas. Dealer mostra ${up.rank}.`);

    if (up.rank === 'A') {
      this.phase = 'INSURANCE';
      for (const s of active) {
        s.insuranceDecision = s.balance >= s.bets.main / 2 ? 'pending' : 'declined';
      }
      this.maybeStartTurns();
    } else {
      this.startTurns();
    }
  }

  // ------------------------------------------------------------ insurance
  private insurance(i: number, take: boolean) {
    this.need('INSURANCE');
    const s = this.occupied(i);
    if (s.insuranceDecision !== 'pending') throw new RuleError('NO_INSURANCE_PENDING', 'Sem decisão de insurance pendente neste lugar.');
    if (typeof take !== 'boolean') throw new RuleError('INVALID_COMMAND', 'Valor inválido.');
    if (take) {
      const amt = s.bets.main / 2; // único valor permitido: metade da aposta principal
      if (s.balance < amt) throw new RuleError('INSUFFICIENT_FUNDS', 'Saldo insuficiente para insurance.');
      s.balance -= amt;
      s.insurance = amt;
      s.insuranceDecision = 'taken';
    } else {
      s.insuranceDecision = 'declined';
    }
    this.maybeStartTurns();
  }

  private maybeStartTurns() {
    if (this.seats.some((s) => s.insuranceDecision === 'pending')) return;
    this.startTurns();
  }

  private startTurns() {
    this.phase = 'PLAYER_TURNS';
    this.advance();
  }

  // ------------------------------------------------------------ turnos
  /** Primeira mão 'playing' em ordem de lugar/mão. */
  currentTurn(): { seat: Seat; hand: Hand; index: number } | null {
    if (this.phase !== 'PLAYER_TURNS') return null;
    for (const seat of this.seats)
      for (let index = 0; index < seat.hands.length; index++)
        if (seat.hands[index]!.status === 'playing') return { seat, hand: seat.hands[index]!, index };
    return null;
  }

  private canSplitCards(h: Hand): boolean {
    if (h.cards.length !== 2) return false;
    const [a, b] = h.cards as [Card, Card];
    return RULES.splitBy === 'rank' ? a.rank === b.rank : cardValue(a) === cardValue(b);
  }

  legalFor(seat: Seat, hand: Hand): Action[] {
    if (hand.status !== 'playing') return [];
    const two = hand.cards.length === 2;
    const legal: Action[] = [];
    const canSplit = two && this.canSplitCards(hand) && seat.splits < RULES.maxSplits && seat.balance >= hand.bet;
    if (!hand.fromAces) {
      legal.push('hit', 'stand');
      if (two && seat.balance >= hand.bet) legal.push('double');
      if (canSplit) legal.push('split');
      if (two && !hand.fromSplit && seat.splits === 0 && seat.hands.length === 1) legal.push('surrender');
    } else {
      // Mãos de ases dividos: uma carta e fim; só resta re-split (se possível) ou parar.
      legal.push('stand');
      if (canSplit) legal.push('split');
    }
    return legal;
  }

  legalActions(): Action[] {
    const t = this.currentTurn();
    return t ? this.legalFor(t.seat, t.hand) : [];
  }

  private normalize(seat: Seat, hand: Hand) {
    const v = handValue(hand.cards);
    if (v.bust) hand.status = 'busted';
    else if (v.total === 21) hand.status = 'stood';
    else if (hand.fromAces && hand.status === 'playing') {
      const legal = this.legalFor(seat, hand);
      if (legal.length === 1) hand.status = 'stood'; // só sobra "stand"
    }
  }

  private advance() {
    if (this.currentTurn()) return;
    this.dealerTurn();
  }

  private act(i: number, action: Action) {
    this.need('PLAYER_TURNS');
    const s = this.occupied(i);
    if (!ACTIONS.includes(action)) throw new RuleError('INVALID_COMMAND', 'Ação inválida.');
    const t = this.currentTurn();
    if (!t || t.seat.index !== s.index) throw new RuleError('NOT_YOUR_TURN', 'Não é a vez deste lugar.');
    if (!this.legalFor(t.seat, t.hand).includes(action))
      throw new RuleError('ILLEGAL_ACTION', `Ação "${action}" não permitida nesta mão.`);
    const { seat, hand, index } = t;
    const shoe = this.shoe!;
    switch (action) {
      case 'hit':
        hand.cards.push(shoe.draw());
        this.normalize(seat, hand);
        break;
      case 'stand':
        hand.status = 'stood';
        break;
      case 'double':
        seat.balance -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(shoe.draw());
        hand.status = handValue(hand.cards).bust ? 'busted' : 'stood';
        break;
      case 'split': {
        seat.balance -= hand.bet;
        seat.splits++;
        const [c1, c2] = hand.cards as [Card, Card];
        const aces = c1.rank === 'A';
        hand.cards = [c1, shoe.draw()];
        hand.fromSplit = true;
        hand.fromAces = aces;
        const h2: Hand = {
          cards: [c2, shoe.draw()], bet: hand.bet, doubled: false, fromSplit: true, fromAces: aces, status: 'playing',
        };
        seat.hands.splice(index + 1, 0, h2);
        this.normalize(seat, hand);
        this.normalize(seat, h2);
        break;
      }
      case 'surrender': {
        const back = hand.bet / 2;
        this.credit(seat, back);
        hand.status = 'surrendered';
        this.record(seat, { kind: 'main', handIndex: index, stake: hand.bet, payout: back, outcome: 'surrender', label: 'Desistência (devolve metade)' });
        break;
      }
    }
    this.advance();
  }

  // ------------------------------------------------------------ dealer e liquidação
  private dealerTurn() {
    this.phase = 'DEALER_TURN';
    this.dealer.holeHidden = false;
    const shoe = this.shoe!;
    const dv0 = handValue(this.dealer.cards);
    const dealerBJ = this.dealer.cards.length === 2 && dv0.total === 21;
    const inRound = this.seats.filter((s) => s.hands.length > 0);

    for (const s of inRound) {
      if (s.insurance > 0) {
        if (dealerBJ) {
          const payout = s.insurance * 3; // 2:1 + devolução
          this.credit(s, payout);
          this.record(s, { kind: 'insurance', stake: s.insurance, payout, outcome: 'win', label: 'Insurance paga 2:1' });
        } else {
          this.record(s, { kind: 'insurance', stake: s.insurance, payout: 0, outcome: 'lose', label: 'Dealer sem blackjack' });
        }
      }
    }

    const anyLive = inRound.some((s) => s.hands.some((h) => h.status === 'stood'));
    const anyBuster = inRound.some((s) => s.bets.buster > 0);
    if (!dealerBJ && (anyLive || anyBuster)) {
      // Dealer para no soft 17: só compra com total < 17.
      while (handValue(this.dealer.cards).total < 17) this.dealer.cards.push(shoe.draw());
    }
    const dv = handValue(this.dealer.cards);
    this.phase = 'SETTLEMENT';

    for (const s of inRound) {
      s.hands.forEach((h, idx) => {
        if (h.status === 'surrendered') return; // já liquidada
        const base = { kind: 'main' as ResultKind, handIndex: idx, stake: h.bet };
        if (h.status === 'busted') {
          this.record(s, { ...base, payout: 0, outcome: 'bust', label: 'Estourou' });
        } else if (dealerBJ) {
          // Mesa sem peek: dealer com blackjack leva tudo que foi apostado (inclusive Double/Split).
          if (h.status === 'blackjack') {
            this.credit(s, h.bet);
            this.record(s, { ...base, payout: h.bet, outcome: 'push', label: 'Blackjack empata com blackjack do dealer' });
          } else this.record(s, { ...base, payout: 0, outcome: 'lose', label: 'Dealer com blackjack' });
        } else if (h.status === 'blackjack') {
          const payout = h.bet + (h.bet * 3) / 2;
          this.credit(s, payout);
          this.record(s, { ...base, payout, outcome: 'blackjack', label: 'Blackjack paga 3:2' });
        } else {
          const pt = handValue(h.cards).total;
          let payout = 0;
          let outcome: BetResult['outcome'] = 'lose';
          let label = 'Derrota';
          if (dv.bust) { payout = h.bet * 2; outcome = 'win'; label = 'Dealer estourou'; }
          else if (pt > dv.total) { payout = h.bet * 2; outcome = 'win'; label = 'Vitória'; }
          else if (pt === dv.total) { payout = h.bet; outcome = 'push'; label = 'Empate'; }
          this.credit(s, payout);
          this.record(s, { ...base, payout, outcome, label });
        }
      });
      if (s.bets.buster > 0) {
        const r = settleBusterLucky(s.bets.buster, dv.bust, this.dealer.cards.length);
        this.credit(s, r.payout);
        this.record(s, { kind: 'buster', stake: s.bets.buster, payout: r.payout, outcome: r.won ? 'win' : 'lose', label: r.label });
      }
    }
    this.say(`Dealer termina com ${dv.total}${dv.bust ? ' (estourou)' : ''}${dealerBJ ? ' (blackjack)' : ''}.`);
  }

  private nextRound() {
    this.need('SETTLEMENT');
    for (const s of this.seats) {
      s.bets = emptyBets();
      s.confirmed = false;
      s.insurance = 0;
      s.insuranceDecision = null;
      s.hands = [];
      s.splits = 0;
      s.results = [];
    }
    this.dealer = { cards: [], holeHidden: false };
    this.round++;
    this.phase = 'BETTING';
  }
}
