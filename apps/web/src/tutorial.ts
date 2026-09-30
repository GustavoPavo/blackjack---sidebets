import type { TableView } from '@bj/engine';

export type TutorialStep = 'chip' | 'main' | 'side' | 'confirm' | 'deal' | 'decide' | 'done';
export const TUTORIAL_ORDER: TutorialStep[] = ['chip', 'main', 'side', 'confirm', 'deal', 'decide', 'done'];

export const TUTORIAL_TEXT: Record<TutorialStep, { title: string; body: string }> = {
  chip: { title: 'Escolha uma ficha', body: 'Toque em uma ficha colorida. O valor impresso nela é quanto você aposta a cada toque.' },
  main: { title: 'Aposte na principal', body: 'Toque na área “Principal” do seu lugar para colocar a ficha. Toda rodada começa pela aposta principal (mínimo R$ 5,00).' },
  side: { title: 'Adicione uma side bet', body: 'Toque em “Pares” ou “23+1” para apostar numa combinação das suas duas primeiras cartas. Side bets exigem a aposta principal e custam no mínimo R$ 2,50.' },
  confirm: { title: 'Confirme as apostas', body: 'Toque em “Confirmar apostas”. Depois de confirmar, as apostas ficam travadas até a rodada terminar.' },
  deal: { title: 'Distribua as cartas', body: 'Toque em “Distribuir”. As cartas saem do shoe uma por vez: primeiro os jogadores, depois o dealer; a segunda carta do dealer fica fechada.' },
  decide: { title: 'Tome uma decisão', body: 'É a sua vez: 11 contra o 6 do dealer. Escolha Pedir, Parar ou Dobrar. O painel de sugestão mostra o que a estratégia básica indicaria e por quê.' },
  done: { title: 'Pronto!', body: 'Você jogou uma rodada de demonstração. Tudo aqui usou créditos de demonstração: seu saldo e seu histórico reais não mudaram.' },
};

/**
 * Passo atual do tutorial, derivado APENAS do estado da sessão de demonstração (vindo do servidor) e de
 * se o jogador já tocou numa ficha. Nada aqui altera o jogo.
 */
export function tutorialStep(view: TableView, chipTouched: boolean): TutorialStep {
  if (view.phase === 'SETTLEMENT') return 'done';
  if (view.phase === 'PLAYER_TURNS' || view.phase === 'INSURANCE' || view.phase === 'DEALING' || view.phase === 'DEALER_TURN') return 'decide';
  const seat = view.seats.find((s) => s.mine) ?? view.seats[0]!;
  if (seat.confirmed) return 'deal';
  const side = seat.bets.twentyThree + seat.bets.pairs + seat.bets.buster;
  if (seat.bets.main > 0 && side > 0) return 'confirm';
  if (seat.bets.main > 0) return 'side';
  return chipTouched ? 'main' : 'chip';
}
