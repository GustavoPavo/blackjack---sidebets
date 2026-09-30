# Modo treino, tutorial e estatísticas

Somente créditos fictícios. Treino e tutorial são **sessões separadas** (em memória no servidor, uma por jogador e por tipo):
têm carteira própria (treino: R$ 1.000,00; demonstração: R$ 100,00), não leem nem alteram a carteira real, o histórico de créditos,
as estatísticas nem o banco. Reiniciar o servidor descarta essas sessões (a mesa real é a que persiste).

## Estratégia básica (`packages/engine/src/strategy.ts`)
Algoritmo **determinístico** por **valor esperado (EV)**, calculado para as regras desta mesa:

- 6 baralhos (aproximados por baralho **infinito**), dealer para no soft 17, blackjack 3:2;
- mesa **sem peek**: Double e Split perdem tudo contra blackjack do dealer (já contado no EV);
- Double em qualquer duas cartas, inclusive após split (exceto mãos de ases divididos);
- Split até 3 vezes (4 mãos), re-split de ases (uma carta por mão de ases);
- **Surrender antecipado**, só como primeira decisão da mão original (perde metade);
- Insurance: 2:1 por metade da aposta → EV = −1/13: a dica é sempre **recusar**.

Como funciona: distribuição do resultado final do dealer para cada carta aberta; EV de Parar/Pedir (recursivo)/Dobrar/Dividir
(recursivo, com re-split e regras de ases)/Desistir (−0,5); escolhe a ação de maior EV entre as **legais** (vindas do motor).

**O que NÃO recomenda (honestidade):** se a diferença de EV entre as duas melhores ações for menor que **0,01** (0,03 em mãos com 3+ cartas),
a dica diz **"Sem recomendação disponível"**, porque o efeito da composição real do shoe pode inverter a decisão. Também não há dica
sem ações, sem cartas ou com mão estourada. A interface mostra sempre o aviso: *estimativa; não garante lucro; o jogo tem vantagem da casa*.

**Testes** (`packages/engine/test/strategy.test.ts`): distribuição do dealer contra valores de referência (estouro 35,36/37,39/39,45/41,64/42,32%
para 2–6…), **simulação independente** (Monte Carlo com semente) do dealer e dos EVs de parar/dobrar, decisões clássicas (dobrar 11 vs 6,
dividir 8-8 vs 6, parar 9-9 vs 7, desistir 16 vs 10…), efeitos da mesa sem peek (não dobra 11 vs 10/Ás; Ás-Ás vs Ás não divide),
casos apertados → sem recomendação, ações sempre dentro do conjunto legal e integração com o motor.

## Tutorial
Sessão de demonstração com **baralho fixo** decidido pelo servidor (`TUTORIAL_SHOE`): 5♥ 6♦ (11) contra 6♠ do dealer.
Passos (derivados do estado da sessão): escolher ficha → apostar na principal → side bet → confirmar → distribuir → decidir.
Pode ser pulado e reaberto em Menu → Configurações → "Abrir tutorial".

## Estatísticas (`GET /api/stats`, `GET /api/history`)
- **Mãos jogadas**: mãos principais resolvidas (cada mão de split conta).
- **Vitória**: retorno > valor apostado na mão (inclui blackjack natural); **empate**: retorno = apostado; **derrota**: retorno < apostado
  (perda, estouro ou desistência).
- **Taxa de vitória** = vitórias ÷ mãos principais jogadas (empates, desistências e estouros contam como não-vitória); sem mãos → "—".
- **Retorno total** = aposta devolvida + lucro; **lucro líquido** = retorno total − valor apostado; por tipo de aposta (principal, 23+1,
  Pares, Buster Lucky, Insurance).
- **Blackjacks naturais**: mãos com duas cartas, sem split, somando 21.
- **Buy-in e rebuy não entram** no resultado (mostrados à parte como "créditos adicionados").
- Histórico: últimas rodadas por lugar e mão, com cartas e cada aposta resolvida.
