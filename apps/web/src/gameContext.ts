import { createContext, useContext } from 'react';
import type { BetKind, TableView } from '@bj/engine';
import type { Intent } from './api';
import type { LayoutMode } from './useMediaQuery';
import type { PresentationApi } from './usePresentation';

/** Tudo o que os componentes da mesa precisam: estado vindo do servidor + ações (intenções). */
export interface Game {
  table: TableView;
  pres: PresentationApi;
  chip: number;
  setChip: (v: number) => void;
  busy: boolean;
  cmd: (intent: Intent) => void;
  bet: (seat: number, kind: BetKind, amount: number) => void;
  hasWallet: boolean;
  /** Cartas voam do shoe (desligado com movimento reduzido). */
  fly: boolean;
  layout: LayoutMode;
  selectedSeat: number;
  selectSeat: (seatIndex: number) => void;
}

export const GameContext = createContext<Game | null>(null);
export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('GameContext ausente');
  return g;
}
