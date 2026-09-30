# Blackjack com side bets (créditos fictícios)

Mesa de Blackjack com 5 lugares e dealer compartilhado. **Somente créditos fictícios** — não há depósito, saque nem dinheiro real. Esta versão é uma **simulação local**: os 5 lugares são controlados na mesma tela (não é multiplayer online).

- Blackjack: 6 baralhos, 3:2, dealer para no soft 17, Hit/Stand/Double/Split/Insurance/Surrender.
- Side bets: 23+1, Pares, Buster Lucky. Buy-in/rebuy de até R$ 1.000,00 por operação.
- **Jogador com carteira única:** o nome é pedido uma vez (salvo no navegador, com opção "Editar nome"); o buy-in inicial é feito uma vez na carteira do jogador, que pode ocupar vários lugares usando o mesmo saldo.
- **Repetir aposta / X2** na fase de apostas, **mensagem de ganho total** ao fim da rodada e distribuição **carta por carta** (lugar 1 à direita, 5 à esquerda; distribuição e turnos 1 → 5).
- Regras e decisões da mesa: [`docs/RULES.md`](docs/RULES.md). Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Vocabulário
- **Lugar** (seat): uma das 5 posições da mesa. Índice interno 0..4; exibido como 1..5. Visualmente, da esquerda para a direita: **5, 4, 3, 2, 1**.
- **Mão** (hand): mão jogada num lugar (1, ou até 4 após splits).
- **Jogador** (player): a pessoa, com id estável e **uma carteira**. Um jogador pode ocupar vários lugares.

## Como usar
1. Informe seu nome (só na primeira visita; "Editar nome" no topo altera o nome em todos os seus lugares sem mudar sua carteira).
2. Faça o **buy-in inicial** no topo (máx. R$ 1.000,00 por operação; depois, **Rebuy** entre rodadas, antes de confirmar apostas).
3. Clique em **Sentar aqui** nos lugares desejados (quantos quiser: todos usam o mesmo saldo do topo).
4. Escolha a ficha, aposte (principal primeiro; side bets exigem principal), **Confirmar apostas** em cada lugar e **Distribuir**.
5. Na rodada seguinte aparecem **Repetir aposta** (repõe principal + 3 side bets da última rodada) e **X2** (dobro). Eles *substituem* as apostas do lugar (não somam), são tudo-ou-nada e validados no servidor contra a carteira compartilhada.
6. Ao fim (depois da animação do dealer) aparece "Você ganhou R$ X,XX" / "Rodada empatada" / "Resultado da rodada: −R$ X,XX" com detalhamento por lugar e aposta.

## Estrutura
```
packages/engine  regras puras em TypeScript (sem React)
apps/server      Node + Express: dono do shoe, turnos, saldos e pagamentos (API HTTP)
apps/web         React + Vite: só renderiza o estado do servidor
```

## Requisitos
Node.js 20+ e npm.

## Instalar
```bash
npm install
```

## Executar
Desenvolvimento (servidor em :3001 e Vite em :5173, com proxy `/api`):
```bash
npm run dev      # abra http://localhost:5173
```
Produção local (build do front e servidor servindo tudo em :3001):
```bash
npm start        # abra http://localhost:3001
```

## Testar
```bash
npm test          # engine + servidor + interface
npm run typecheck
npm run build     # compila o frontend
```

## Atualizar sua cópia local e testar
Branch: `claude/adoring-mendel-3fetcq`
```bash
git fetch origin
git checkout claude/adoring-mendel-3fetcq
git pull origin claude/adoring-mendel-3fetcq
npm install
npm test
npm run dev        # abra http://localhost:5173
```
(Se ainda não tem o repositório: `git clone <url-do-repositório>` e depois os comandos acima dentro da pasta.)

> O estado da mesa e as carteiras ficam **em memória no servidor**: reiniciar o servidor (ou "Reiniciar simulação") zera carteiras e rodada. O navegador re-registra seu nome automaticamente; faça o buy-in de novo.

## API (simulação local)
- `GET /api/table?playerId=<id>` — estado público da mesa (sem carta fechada nem shoe) + a carteira (`me`) e os lugares do jogador.
- `POST /api/commands` — `{ "command": { "id": "<único>", "playerId": "<id>", "type": "...", ... } }`. Comandos: `setName`, `buyIn`, `rebuy`, `takeSeat`, `leave`, `setBet`, `repeatBets` (`multiplier` 1 ou 2), `clearBets`, `confirmBets`, `editBets`, `deal`, `insurance`, `action`, `nextRound`. Reenviar o mesmo `id` não repete o efeito. Comandos de lugar só são aceitos do dono do lugar.
- `POST /api/reset` — reinicia a simulação.

O `playerId` é apenas um identificador gerado no navegador (não é autenticação). Ele é a chave da carteira; o nome é só exibição.

## Rumo ao multiplayer online
O motor não conhece rede nem interface e já separa jogador (carteira) de lugar, valida o dono do lugar em cada comando e é idempotente. Para multiplayer: obter o `playerId` de uma sessão autenticada e trocar o polling HTTP por WebSocket.
