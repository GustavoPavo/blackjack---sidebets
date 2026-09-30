import { Shoe, TUTORIAL_SHOE, Table, toView, type Card, type Command, type CommandResult, type Rank, type Suit, type TableView, type Rng } from '@bj/engine';

export type SandboxKind = 'training' | 'demo';
export const isSandboxKind = (v: unknown): v is SandboxKind => v === 'training' || v === 'demo';

export { TUTORIAL_SHOE };
const card = (code: string): Card => ({ rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit });

const START_CREDITS: Record<SandboxKind, number> = { training: 100_000, demo: 10_000 };

interface Box { table: Table; touched: number }

/**
 * Sessões separadas de TREINO e DEMONSTRAÇÃO (tutorial). Cada jogador tem a sua, em memória, com carteira de
 * créditos de treino própria: nada aqui lê ou altera a carteira real, o histórico ou as estatísticas, e nada é
 * gravado no banco. Reiniciar o servidor descarta as sessões (a mesa real é que é persistida).
 */
export class SandboxService {
  private boxes = new Map<string, Box>();
  constructor(private opts: { rng?: Rng; now?: () => number; ttlMs?: number } = {}) {}
  private now() { return (this.opts.now ?? Date.now)(); }
  private key(playerId: string, kind: SandboxKind) { return `${playerId}:${kind}`; }

  private sweep() {
    const limit = this.now() - (this.opts.ttlMs ?? 2 * 3600_000);
    for (const [k, b] of this.boxes) if (b.touched < limit) this.boxes.delete(k);
  }

  private create(playerId: string, name: string, kind: SandboxKind): Table {
    const t = kind === 'demo'
      ? new Table({ shoeFactory: () => Shoe.stacked(TUTORIAL_SHOE.map(card)), reshuffleBelow: 0 })
      : new Table({ rng: this.opts.rng });
    const r = (cmd: Record<string, unknown>) => t.dispatch({ id: `init-${String(cmd.type)}`, playerId, ...cmd } as Command);
    r({ type: 'setName', name });
    r({ type: 'buyIn', amount: START_CREDITS[kind] });
    r({ type: 'takeSeat', seat: 0 });
    return t;
  }

  /** (Re)inicia a sessão do jogador. */
  start(playerId: string, name: string, kind: SandboxKind): TableView {
    this.sweep();
    this.boxes.set(this.key(playerId, kind), { table: this.create(playerId, name, kind), touched: this.now() });
    return this.view(playerId, name, kind);
  }

  private box(playerId: string, name: string, kind: SandboxKind): Box {
    this.sweep();
    let b = this.boxes.get(this.key(playerId, kind));
    if (!b) { b = { table: this.create(playerId, name, kind), touched: this.now() }; this.boxes.set(this.key(playerId, kind), b); }
    b.touched = this.now();
    return b;
  }

  view(playerId: string, name: string, kind: SandboxKind): TableView {
    return toView(this.box(playerId, name, kind).table, playerId, { kind, hints: true });
  }

  execute(playerId: string, name: string, kind: SandboxKind, raw: unknown): { result: CommandResult; view: TableView } {
    const b = this.box(playerId, name, kind);
    if (!raw || typeof raw !== 'object') return { result: { ok: false, code: 'INVALID_COMMAND', message: 'Corpo inválido.' }, view: this.view(playerId, name, kind) };
    const result = b.table.dispatch({ ...(raw as object), playerId } as Command); // o jogador vem da sessão
    return { result, view: this.view(playerId, name, kind) };
  }

  get size() { return this.boxes.size; }
}
