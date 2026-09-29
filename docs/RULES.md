# Regras implementadas e decisões da mesa

Valores em centavos inteiros; créditos fictícios. Constantes em `packages/engine/src/types.ts`.

## Decisões do dono da mesa (respondidas)
| Tema | Regra implementada |
|---|---|
| Resplit de ases | Permitido, dentro do limite global de 3 splits. Cada mão de ases recebe 1 carta; se formar A+A e ainda houver split/saldo, só resta Split ou Stand (nunca Hit/Double). |
| Surrender | Só como primeira decisão da mão original (antes de qualquer Hit/Double/Split). **Early**: devolve metade da aposta principal, exista ou não blackjack do dealer. |
| Insurance | Só quando a carta aberta do dealer é Ás. Único valor: metade da aposta principal. Paga 2:1. Liquidado quando o dealer revela a carta fechada. Exige saldo (sem saldo é recusado automaticamente). |
| Blackjack do dealer | Mesa **sem peek**: os jogadores agem antes; o dealer revela no fim. Dealer com blackjack leva tudo que foi apostado (inclusive Double e Split). Blackjack natural do jogador empata. |
| 23+1, Ás | Ás alto e baixo, mas só **A-2-3** e **Q-K-A** (K-A-2 não vale). |
| Pares | Precisa ser o mesmo rank (QQ). Perfect = mesmo naipe; Coloured = mesma cor, naipes diferentes; Red/Black = cores diferentes. Q-K não é par. |

## Suposições feitas (confirmadas pelo dono da mesa)
- Surrender "já devolve": interpretado como devolução de **metade** da aposta.
- Dealer com 10 aberto e Ás fechado também conta como blackjack no confronto final (sem peek, é 21 em duas cartas). Insurance só é oferecido com Ás aberto.
- Split permitido para qualquer par de **mesmo valor** (ex.: K+10). `RULES.splitBy = 'rank'` restringe a mesmo rank.
- Aposta principal em centavos pares (para 3:2 e metade exatos).
- "GKA" foi lido como Q-K-A.
- Insurance é oferecido também a quem tem blackjack natural (sem regra especial de "even money").
- Dealer joga suas cartas mesmo que todas as mãos tenham estourado se houver alguma Buster Lucky.

## Liquidação
1. Distribuição (1 carta por lugar, dealer aberta, 2ª carta por lugar, dealer fechada): **23+1 e Pares** liquidam já.
2. Insurance (se Ás): decisões de cada lugar.
3. Turnos: lugares da esquerda para a direita, mãos em ordem. Auto-stand em 21/estouro.
4. Turno do dealer: revela a carta; Insurance liquida; compra até 17 (para no soft 17).
5. **Mão principal e Buster Lucky** liquidam ao final. Cada aposta gera um registro separado em `seat.results`.

## Integridade
- `Table.dispatch` valida antes de mutar e ignora `id` de comando já processado (cache de sucesso).
- O cliente envia apenas intenções; a resposta traz o estado sem a carta fechada nem o shoe.
