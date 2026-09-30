import type { Card } from './cards';
import type { Cents } from './money';
import type { BetResult, ResultKind } from './types';

// ---- Preferências (salvas por jogador no servidor e em cache local)
export interface Preferences {
  sound: boolean;
  vibration: boolean;
  animationSpeed: 'normal' | 'fast';
  reducedMotion: 'system' | 'on' | 'off';
  trainingHints: boolean;
  tutorialSeen: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  sound: true, vibration: true, animationSpeed: 'normal', reducedMotion: 'system', trainingHints: true, tutorialSeen: false,
};

/** Valida um objeto parcial de preferências. Retorna null se houver chave desconhecida ou valor inválido. */
export function parsePreferences(input: unknown): Partial<Preferences> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Partial<Preferences> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    switch (k) {
      case 'sound': case 'vibration': case 'trainingHints': case 'tutorialSeen':
        if (typeof v !== 'boolean') return null;
        out[k] = v; break;
      case 'animationSpeed':
        if (v !== 'normal' && v !== 'fast') return null;
        out.animationSpeed = v; break;
      case 'reducedMotion':
        if (v !== 'system' && v !== 'on' && v !== 'off') return null;
        out.reducedMotion = v; break;
      default: return null;
    }
  }
  return out;
}

// ---- Estatísticas e histórico
export interface KindStats {
  /** Quantidade de apostas resolvidas desse tipo. */
  count: number;
  /** Apostas vencedoras (retorno > valor apostado). */
  wins: number;
  /** Soma apostada. */
  stake: Cents;
  /** Retorno total (aposta devolvida + lucro). */
  returned: Cents;
  /** Lucro líquido = retorno total − apostado. */
  net: Cents;
}
export interface PlayerStats {
  rounds: number;
  /** Mãos principais resolvidas (cada mão de split conta). */
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Blackjacks naturais (duas cartas, sem split). */
  naturals: number;
  /** Vitórias ÷ mãos principais. Empates, desistências e estouros contam no denominador. null sem mãos. */
  winRate: number | null;
  stake: Cents;
  returned: Cents;
  net: Cents;
  byKind: Record<ResultKind, KindStats>;
  /** Créditos fictícios adicionados por buy-in/rebuy. NÃO entram no lucro. */
  creditsAdded: Cents;
}

export interface HistoryHand { index: number; cards: Card[]; bet: Cents; doubled: boolean; fromSplit: boolean; status: string }
export interface HistorySeat {
  seat: number; // 0..4 (exibir seat + 1)
  number: number;
  net: Cents;
  hands: HistoryHand[];
  results: (Pick<BetResult, 'kind' | 'stake' | 'payout' | 'net' | 'outcome' | 'label'> & { handIndex: number | null })[];
}
export interface RoundHistoryEntry {
  roundId: number;
  settledAt: string;
  dealer: Card[];
  net: Cents;
  seats: HistorySeat[];
}
