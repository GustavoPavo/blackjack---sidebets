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
  SNAPSHOT_VERSION, type Phase, type Player, type ResultKind, type Seat, type TableSnapshot,
} from './types';

export interface TableOptions {
  rng?: Rng;
  shoeFactory?: () => Shoe;
  now?: () => Date;
  reshuffleBelow?: number;
}

type Bets = Record<BetKind, Cents>;
const emptyBets = (): Bets => ({ main: 0, twentyThree: 0, pairs: 0, buster: 0 });
const sumBets = (b: Bets) => b.main + b.twentyThree + b.pairs + b.buster;
const newSeat = (index: number): Seat => ({
  index, playerId: null, bets: emptyBets(), lastBets: null, confirmed: false,
  insurance: 0, insuranceDecision: null, hands: [], splits: 0, results: [],
});
const MAX_NAME = 20;

/**
 * Mesa de 5 lugares + dealer compartilhado. Autoridade única sobre baralho, turnos, carteiras e
 * pagamentos. Todas as mutações passam por `dispatch`, que valida antes de alterar o estado e
 * ignora comandos repetidos (mesmo `id`).
 *
 * Carteira: cada jogador (`Player`, id estável) tem UMA carteira, usada por todos os lugares que ele
 * ocupa e por todas as suas mãos (inclusive splits). Apostas debitam a carteira ao serem feitas.
 *
 * Fluxo: BETTING → DEALING → (INSURANCE) → PLAYER_TURNS → DEALER_TURN → SETTLEMENT → BETTING.
 * DEALING e DEALER_TURN são transitórios (executam dentro de um único comando).
 *
 * Ordem: os lugares são distribuídos e jogam na ordem 1 → 2 → 3 → 4 → 5 (índices 0..4).
 * Distribuição: 1ª carta de cada lugar com aposta, 1ª do dealer (aberta), 2ª de cada lugar, 2ª do dealer (fechada).
 *
 * Liquidação (ver docs/RULES.md):
 *  - 23+1 e Pares: logo após a distribuição.
 *  - Insurance: quando o dealer revela a carta fechada (mesa sem "peek").
 *  - Buster Lucky e mãos principais: fim do turno do dealer.
 */
export class Table {
  phase: Phase = 'BETTING';
  round = 1;
  seats: Seat[] = Array.from({ length: RULES.seats }, (_, i) => newSeat(i));
  players = new Map<string, Player>();
  dealer: { cards: Card[]; seq: number[]; holeHidden: boolean } = { cards: [], seq: [], holeHidden: false };
  shoe: Shoe | null = null;
  log: string[] = [];
  /** Contador global de cartas sacadas (dá a ordem de distribuição/animação). */
  drawn = 0;
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

  // ------------------------------------------------------------ consultas
  balanceOf(playerId: string): Cents { return this.players.get(playerId)?.balance ?? 0; }
  seatsOf(playerId: string): Seat[] { return this.seats.filter((s) => s.playerId === playerId); }
  playerAt(seatIndex: number): Player | null {
    const id = this.seats[seatIndex]?.playerId;
    return id ? this.players.get(id) ?? null : null;
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
      case 'setName': return this.setName(cmd.playerId, cmd.name);
      case 'buyIn': return this.buy(cmd.id, cmd.playerId, cmd.amount, false);
      case 'rebuy': return this.buy(cmd.id, cmd.playerId, cmd.amount, true);
      case 'takeSeat': return this.takeSeat(cmd.playerId, cmd.seat);
      case 'leave': return this.leave(cmd.playerId, cmd.seat);
      case 'setBet': return this.setBet(cmd.playerId, cmd.seat, cmd.kind, cmd.amount);
      case 'repeatBets': return this.repeatBets(cmd.playerId, cmd.seat, cmd.multiplier);
      case 'clearBets': return this.clearBets(cmd.playerId, cmd.seat);
      case 'confirmBets': return this.confirm(cmd.playerId, cmd.seat, true);
      case 'editBets': return this.confirm(cmd.playerId, cmd.seat, false);
      case 'deal': this.getPlayer(cmd.playerId); return this.deal();
      case 'insurance': return this.insurance(cmd.playerId, cmd.seat, cmd.take);
      case 'action': return this.act(cmd.playerId, cmd.seat, cmd.action);
      case 'nextRound': this.getPlayer(cmd.playerId); return this.nextRound();
      default: throw new RuleError('INVALID_COMMAND', 'Comando desconhecido.');
    }
  }

  // ------------------------------------------------------------ helpers
  private getPlayer(id: unknown): Player {
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) throw new RuleError('INVALID_PLAYER', 'Identificador de jogador inválido.');
    const p = this.players.get(id);
    if (!p) throw new RuleError('UNKNOWN_PLAYER', 'Jogador desconhecido: informe o nome primeiro.');
    return p;
  }
  private seatAt(i: unknown): Seat {
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= RULES.seats)
      throw new RuleError('INVALID_SEAT', 'Lugar inválido.');
    return this.seats[i]!;
  }
  /** Lugar ocupado e pertencente ao jogador. */
  private ownedSeat(playerId: unknown, i: unknown): Seat {
    const s = this.seatAt(i);
    if (!s.playerId) throw new RuleError('SEAT_EMPTY', 'Lugar vazio.');
    const p = this.getPlayer(playerId);
    if (s.playerId !== p.id) throw new RuleError('NOT_SEAT_OWNER', 'Este lugar pertence a outro jogador.');
    return s;
  }
  private wallet(seat: Seat): Player { return this.players.get(seat.playerId!)!; }
  private nameOf(seat: Seat) { return this.wallet(seat).name; }
  private need(phase: Phase) {
    if (this.phase !== phase) throw new RuleError('WRONG_PHASE', `Ação indisponível na fase ${this.phase}.`);
  }
  private say(msg: string) {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
  }
  private credit(seat: Seat, amount: Cents) { this.wallet(seat).balance += amount; }
  private record(seat: Seat, r: Omit<BetResult, 'net'>) {
    seat.results.push({ ...r, net: r.payout - r.stake });
  }
  private drawTo(target: { cards: Card[]; seq: number[] }) {
    target.cards.push(this.shoe!.draw());
    target.seq.push(++this.drawn);
  }

  // ------------------------------------------------------------ jogador, buy-in / rebuy
  /** Cria o jogador (carteira zerada) ou atualiza o nome. Nunca cria outra carteira nem apaga histórico. */
  private setName(playerId: unknown, name: unknown) {
    if (typeof playerId !== 'string' || playerId.length === 0 || playerId.length > 64)
      throw new RuleError('INVALID_PLAYER', 'Identificador de jogador inválido.');
    const n = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
    if (!n) throw new RuleError('INVALID_NAME', 'Informe um nome.');
    const p = this.players.get(playerId);
    if (p) { this.say(`${p.name} agora se chama ${n}.`); p.name = n; }
    else this.players.set(playerId, { id: playerId, name: n, balance: 0, ledger: [] });
  }

  /** Buy-in inicial (uma vez) ou rebuy, sempre na carteira do jogador. Máx. R$ 1.000,00 por operação. */
  private buy(commandId: string, playerId: unknown, amount: number, rebuy: boolean) {
    this.need('BETTING');
    const p = this.getPlayer(playerId);
    if (rebuy) {
      if (p.ledger.length === 0) throw new RuleError('NO_WALLET', 'Faça o buy-in inicial antes de um rebuy.');
      if (this.seatsOf(p.id).some((s) => s.confirmed))
        throw new RuleError('BETS_CONFIRMED', 'Rebuy não é permitido após confirmar as apostas.');
    } else if (p.ledger.length > 0) throw new RuleError('ALREADY_BOUGHT_IN', 'O buy-in inicial já foi feito; use rebuy.');
    const bad = validateBuyAmount(amount);
    if (bad === 'INVALID_AMOUNT') throw new RuleError('INVALID_AMOUNT', 'Valor deve ser um inteiro positivo em centavos.');
    if (bad === 'EXCEEDS_MAX_BUYIN')
      throw new RuleError('EXCEEDS_MAX_BUYIN', `Máximo de ${formatBRL(RULES.maxBuy)} por operação.`);
    p.balance += amount;
    p.ledger.push({
      commandId, type: rebuy ? 'rebuy' : 'buyIn', amount, at: this.now().toISOString(), balanceAfter: p.balance,
    });
    this.say(`${p.name}: ${rebuy ? 'rebuy' : 'buy-in'} de ${formatBRL(amount)} (créditos fictícios).`);
  }

  private takeSeat(playerId: unknown, i: unknown) {
    this.need('BETTING');
    const s = this.seatAt(i);
    const p = this.getPlayer(playerId);
    if (s.playerId) throw new RuleError('SEAT_OCCUPIED', 'Lugar já ocupado.');
    if (p.ledger.length === 0) throw new RuleError('NO_BUYIN', 'Faça o buy-in inicial para ocupar um lugar.');
    s.playerId = p.id;
    this.say(`${p.name} ocupou o lugar ${s.index + 1}.`);
  }

  /** Libera o lugar e devolve à carteira as apostas ainda não jogadas. A carteira permanece. */
  private leave(playerId: unknown, i: unknown) {
    this.need('BETTING');
    const s = this.ownedSeat(playerId, i);
    this.refundBets(s, BET_KINDS);
    this.say(`${this.nameOf(s)} deixou o lugar ${s.index + 1}.`);
    this.seats[s.index] = newSeat(s.index);
  }

  // ------------------------------------------------------------ apostas
  private refundBets(s: Seat, kinds: BetKind[]) {
    for (const k of kinds) { this.credit(s, s.bets[k]); s.bets[k] = 0; }
  }

  private setBet(playerId: unknown, i: unknown, kind: BetKind, amount: number) {
    this.need('BETTING');
    const s = this.ownedSeat(playerId, i);
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
    const w = this.wallet(s);
    const delta = amount - s.bets[kind];
    if (delta > w.balance) throw new RuleError('INSUFFICIENT_FUNDS', 'Saldo insuficiente.');
    w.balance -= delta;
    s.bets[kind] = amount;
  }

  /**
   * "Repetir aposta" (×1) e "X2" (×2): SUBSTITUI as apostas atuais do lugar pela configuração inicial da
   * última rodada. Tudo ou nada: valida mínimos e a carteira compartilhada antes de mudar qualquer coisa.
   * Repetir o comando não debita de novo (o resultado é sempre o mesmo estado).
   */
  private repeatBets(playerId: unknown, i: unknown, multiplier: unknown) {
    this.need('BETTING');
    const s = this.ownedSeat(playerId, i);
    if (s.confirmed) throw new RuleError('BETS_LOCKED', 'Apostas confirmadas: edite antes de repetir.');
    if (multiplier !== 1 && multiplier !== 2) throw new RuleError('INVALID_MULTIPLIER', 'Multiplicador inválido.');
    if (!s.lastBets) throw new RuleError('NO_PREVIOUS_BETS', 'Este lugar ainda não tem uma aposta anterior.');
    const target = emptyBets();
    for (const k of BET_KINDS) target[k] = s.lastBets[k] * multiplier;
    if (target.main < RULES.minMain) throw new RuleError('BELOW_MIN_BET', `Aposta principal mínima: ${formatBRL(RULES.minMain)}.`);
    if (target.main % 2 !== 0) throw new RuleError('ODD_MAIN_BET', 'A aposta principal deve ter centavos pares.');
    for (const k of ['twentyThree', 'pairs', 'buster'] as const) {
      if (target[k] > 0 && target.main <= 0) throw new RuleError('NO_MAIN_BET', 'Side bets exigem aposta principal.');
      if (target[k] > 0 && target[k] < RULES.minSide) throw new RuleError('BELOW_MIN_BET', `Side bet mínima: ${formatBRL(RULES.minSide)}.`);
    }
    const w = this.wallet(s);
    const available = w.balance + sumBets(s.bets); // as apostas atuais deste lugar voltam à carteira ao serem substituídas
    const needed = sumBets(target);
    if (needed > available)
      throw new RuleError('INSUFFICIENT_FUNDS', `Saldo insuficiente para ${multiplier === 2 ? 'X2' : 'repetir a aposta'}: são necessários ${formatBRL(needed)} e há ${formatBRL(available)} disponíveis. Suas apostas atuais foram mantidas.`);
    w.balance = available - needed;
    s.bets = target;
  }

  private clearBets(playerId: unknown, i: unknown) {
    this.need('BETTING');
    const s = this.ownedSeat(playerId, i);
    if (s.confirmed) throw new RuleError('BETS_LOCKED', 'Apostas confirmadas: edite antes de limpar.');
    this.refundBets(s, BET_KINDS);
  }

  private confirm(playerId: unknown, i: unknown, value: boolean) {
    this.need('BETTING');
    const s = this.ownedSeat(playerId, i);
    if (value && s.bets.main < RULES.minMain)
      throw new RuleError('NO_MAIN_BET', 'Faça uma aposta principal válida antes de confirmar.');
    s.confirmed = value;
  }

  // ------------------------------------------------------------ distribuição
  private deal() {
    this.need('BETTING');
    const active = this.seats.filter((s) => s.playerId && s.bets.main > 0);
    if (active.some((s) => !s.confirmed)) throw new RuleError('SEATS_NOT_CONFIRMED', 'Há lugares com apostas não confirmadas.');
    if (active.length === 0) throw new RuleError('NO_BETS', 'Nenhuma aposta confirmada.');

    if (!this.shoe || this.shoe.remaining < this.reshuffleBelow) {
      this.shoe = this.shoeFactory();
      this.say('Novo shoe de 6 baralhos embaralhado.');
    }
    this.phase = 'DEALING';
    for (const s of active) {
      s.lastBets = { ...s.bets }; // configuração inicial: Double/Split/Insurance não entram aqui
      s.hands = [{ cards: [], seq: [], bet: s.bets.main, doubled: false, fromSplit: false, fromAces: false, status: 'playing' }];
    }
    this.dealer = { cards: [], seq: [], holeHidden: true };
    // Ordem: 1ª carta de cada lugar (1→5), 1ª do dealer, 2ª de cada lugar, carta fechada do dealer.
    for (const s of active) this.drawTo(s.hands[0]!);
    this.drawTo(this.dealer);
    for (const s of active) this.drawTo(s.hands[0]!);
    this.drawTo(this.dealer);
    const up = this.dealer.cards[0]!;

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
        s.insuranceDecision = this.wallet(s).balance >= s.bets.main / 2 ? 'pending' : 'declined';
      }
      this.maybeStartTurns();
    } else {
      this.startTurns();
    }
  }

  // ------------------------------------------------------------ insurance
  private insurance(playerId: unknown, i: unknown, take: boolean) {
    this.need('INSURANCE');
    const s = this.ownedSeat(playerId, i);
    if (s.insuranceDecision !== 'pending') throw new RuleError('NO_INSURANCE_PENDING', 'Sem decisão de insurance pendente neste lugar.');
    if (typeof take !== 'boolean') throw new RuleError('INVALID_COMMAND', 'Valor inválido.');
    if (take) {
      const amt = s.bets.main / 2; // único valor permitido: metade da aposta principal
      const w = this.wallet(s);
      if (w.balance < amt) throw new RuleError('INSUFFICIENT_FUNDS', 'Saldo insuficiente para insurance.');
      w.balance -= amt;
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
  /** Primeira mão 'playing' em ordem de lugar (1→5) e, dentro do lugar, de mão. */
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
    const funds = this.wallet(seat).balance >= hand.bet; // carteira compartilhada entre lugares e mãos
    const two = hand.cards.length === 2;
    const legal: Action[] = [];
    const canSplit = two && this.canSplitCards(hand) && seat.splits < RULES.maxSplits && funds;
    if (!hand.fromAces) {
      legal.push('hit', 'stand');
      if (two && funds) legal.push('double');
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

  private act(playerId: unknown, i: unknown, action: Action) {
    this.need('PLAYER_TURNS');
    const s = this.ownedSeat(playerId, i);
    if (!ACTIONS.includes(action)) throw new RuleError('INVALID_COMMAND', 'Ação inválida.');
    const t = this.currentTurn();
    if (!t || t.seat.index !== s.index) throw new RuleError('NOT_YOUR_TURN', 'Não é a vez deste lugar.');
    if (!this.legalFor(t.seat, t.hand).includes(action))
      throw new RuleError('ILLEGAL_ACTION', `Ação "${action}" não permitida nesta mão.`);
    const { seat, hand, index } = t;
    const w = this.wallet(seat);
    switch (action) {
      case 'hit':
        this.drawTo(hand);
        this.normalize(seat, hand);
        break;
      case 'stand':
        hand.status = 'stood';
        break;
      case 'double':
        w.balance -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        this.drawTo(hand);
        hand.status = handValue(hand.cards).bust ? 'busted' : 'stood';
        break;
      case 'split': {
        w.balance -= hand.bet;
        seat.splits++;
        const [c1, c2] = hand.cards as [Card, Card];
        const [s1, s2] = hand.seq as [number, number];
        const aces = c1.rank === 'A';
        hand.cards = [c1];
        hand.seq = [s1];
        this.drawTo(hand);
        hand.fromSplit = true;
        hand.fromAces = aces;
        const h2: Hand = {
          cards: [c2], seq: [s2], bet: hand.bet, doubled: false, fromSplit: true, fromAces: aces, status: 'playing',
        };
        this.drawTo(h2);
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
      while (handValue(this.dealer.cards).total < 17) this.drawTo(this.dealer);
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
    this.resetRound();
  }

  private resetRound() {
    for (const s of this.seats) {
      s.bets = emptyBets(); // `lastBets` e o ocupante permanecem
      s.confirmed = false;
      s.insurance = 0;
      s.insuranceDecision = null;
      s.hands = [];
      s.splits = 0;
      s.results = [];
    }
    this.dealer = { cards: [], seq: [], holeHidden: false };
    this.round++;
    this.phase = 'BETTING';
  }

  // ------------------------------------------------------------ persistência e administração
  /** Estado da mesa (sem carteiras) serializável em JSON, incluindo o shoe restante. */
  snapshot(): TableSnapshot {
    return JSON.parse(JSON.stringify({
      version: SNAPSHOT_VERSION, phase: this.phase, round: this.round, seats: this.seats, dealer: this.dealer,
      shoe: this.shoe ? this.shoe.toArray() : null, log: this.log, drawn: this.drawn,
    }));
  }

  /**
   * Restaura um snapshot. Os jogadores (`this.players`) devem já estar carregados. Falha (sem alterar nada)
   * se o snapshot for inconsistente: é preferível não iniciar a perder ou duplicar créditos em silêncio.
   */
  restore(snap: TableSnapshot) {
    const bad = (why: string) => { throw new Error(`Snapshot da mesa inválido: ${why}`); };
    if (!snap || snap.version !== SNAPSHOT_VERSION) bad('versão desconhecida');
    if (!['BETTING', 'INSURANCE', 'PLAYER_TURNS', 'SETTLEMENT'].includes(snap.phase)) bad(`fase ${snap.phase}`);
    if (!Number.isInteger(snap.round) || snap.round < 1 || !Number.isInteger(snap.drawn) || snap.drawn < 0) bad('contadores');
    if (!Array.isArray(snap.seats) || snap.seats.length !== RULES.seats) bad('lugares');
    snap.seats.forEach((s, i) => {
      if (s.index !== i) bad('índice de lugar');
      if (s.playerId !== null && !this.players.has(s.playerId)) bad(`lugar ${i + 1} aponta para jogador inexistente`);
      for (const k of BET_KINDS) if (!Number.isSafeInteger(s.bets[k]) || s.bets[k] < 0) bad('aposta inválida');
      for (const h of s.hands) {
        if (!Number.isSafeInteger(h.bet) || h.bet <= 0 || h.cards.length !== h.seq.length) bad('mão inválida');
      }
    });
    if (!snap.dealer || snap.dealer.cards.length !== snap.dealer.seq.length) bad('dealer');
    const copy: TableSnapshot = JSON.parse(JSON.stringify(snap));
    this.phase = copy.phase;
    this.round = copy.round;
    this.seats = copy.seats;
    this.dealer = copy.dealer;
    this.shoe = copy.shoe ? Shoe.stacked(copy.shoe) : null;
    this.log = copy.log;
    this.drawn = copy.drawn;
  }

  /**
   * Cancela a rodada em andamento devolvendo EXATAMENTE as apostas ainda não liquidadas (mãos não
   * desistidas, Insurance e Buster Lucky). 23+1, Pares e Surrender já foram liquidados e permanecem.
   * Ferramenta administrativa/de desenvolvimento (não é um comando de jogador).
   */
  abortRound(): Cents {
    let refunded = 0;
    if (this.phase === 'SETTLEMENT') { this.resetRound(); return 0; }
    for (const s of this.seats) {
      if (!s.playerId) continue;
      if (this.phase === 'BETTING') {
        for (const k of BET_KINDS) refunded += s.bets[k];
        this.refundBets(s, BET_KINDS);
        continue;
      }
      for (const h of s.hands) if (h.status !== 'surrendered') { this.credit(s, h.bet); refunded += h.bet; }
      if (s.insurance > 0) { this.credit(s, s.insurance); refunded += s.insurance; }
      if (s.bets.buster > 0) { this.credit(s, s.bets.buster); refunded += s.bets.buster; }
    }
    this.say(`Rodada cancelada: ${formatBRL(refunded)} devolvidos.`);
    this.resetRound();
    return refunded;
  }
}
