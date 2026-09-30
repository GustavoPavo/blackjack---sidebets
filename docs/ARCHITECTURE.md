# Arquitetura proposta

```
packages/engine   Regras puras em TypeScript (sem React, sem I/O). Testável com vitest.
apps/server       Node + TS. Dono do shoe, turnos, saldos, pagamentos. API HTTP + WebSocket.
apps/web          React + TS (Vite). Só renderiza o estado enviado pelo servidor e envia intenções.
docs/             Decisões e arquitetura.
```

Multiplayer futuro: o servidor mantém `Table` com `seats[5]`; cada comando leva `seatId` e
`commandId` (idempotência). Hoje o cliente local controla os 5 lugares ("modo mesa local");
no futuro basta associar cada lugar a uma sessão/token autenticado. A UI rotulará
explicitamente "Simulação local" e nunca "online".

## Estados da rodada

`BETTING` → `DEALING` → (`INSURANCE`)? → `PLAYER_TURNS` → `DEALER_TURN` → `SETTLEMENT` → `BETTING`

- BETTING: apostas/limpar, buy-in e rebuy permitidos (rebuy só aqui, antes de confirmar).
  Cada lugar "confirma" as apostas; ao iniciar, nenhuma alteração.
- DEALING: 2 cartas por lugar com aposta + 1 aberta e 1 fechada do dealer.
  Side bets 23+1 e Pares liquidadas logo após a distribuição (dependem só das cartas iniciais).
- INSURANCE: só se a carta aberta do dealer for Ás (detalhes pendentes).
- PLAYER_TURNS: um lugar/mão por vez; ações validadas contra o estado da mão.
- DEALER_TURN: dealer compra até 17 rígido (para no soft 17).
- SETTLEMENT: paga mão principal por mão; Buster Lucky liquidada aqui (depende do estouro).
  Cada aposta gera um registro de resultado separado.

Integridade: comandos com `commandId` já processado são ignorados; ações fora da vez
ou de estado errado são rejeitadas sem alterar saldo. Tudo em centavos inteiros.

## Feito até aqui (independente das decisões pendentes)

`money`, `cards`, `shoe` (6 baralhos, RNG injetável), `handValue` (Ás 1/11, soft),
`Buster Lucky` (tabela e liquidação) + testes.

## v2: jogador, carteira e apresentação
- `Table.players` (id estável → nome, carteira, histórico). `Seat.playerId` aponta para o dono; não há saldo por lugar.
- `toView(table, playerId)` monta a visão do jogador (`me`, `mine`, `canRepeat`, `roundSummary`...). Cada carta tem `seq` (ordem global de saque).
- O servidor resolve a rodada de uma vez; o cliente (`apps/web/src/reveal.ts`, `usePresentation.ts`) só decide *quando* mostrar cada carta pela ordem de `seq`, escondendo totais, resultados, saldo atualizado e a mensagem final até a animação terminar.
