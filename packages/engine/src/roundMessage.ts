import { formatBRL, type Cents } from './money';

export interface RoundMessage { kind: 'win' | 'tie' | 'loss'; text: string }

/** Mensagem final da rodada a partir do lucro líquido total (devolução de aposta não é lucro). */
export function roundMessage(net: Cents): RoundMessage {
  if (net > 0) return { kind: 'win', text: `Você ganhou ${formatBRL(net)}` };
  if (net === 0) return { kind: 'tie', text: 'Rodada empatada' };
  return { kind: 'loss', text: `Resultado da rodada: −${formatBRL(-net)}` };
}
