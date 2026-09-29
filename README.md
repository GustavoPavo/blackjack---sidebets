# Blackjack com side bets (créditos fictícios)

Mesa de Blackjack com 5 lugares e dealer compartilhado. **Somente créditos fictícios** — não há depósito, saque nem dinheiro real. Esta versão é uma **simulação local**: os 5 lugares são controlados na mesma tela (não é multiplayer online).

- Blackjack: 6 baralhos, 3:2, dealer para no soft 17, Hit/Stand/Double/Split/Insurance/Surrender.
- Side bets: 23+1, Pares, Buster Lucky. Buy-in/rebuy de até R$ 1.000,00 por operação.
- Regras e decisões da mesa: [`docs/RULES.md`](docs/RULES.md). Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
```

## API (simulação local)
- `GET /api/table` — estado público da mesa (sem carta fechada nem shoe)
- `POST /api/commands` — `{ "command": { "id": "<único>", "type": "...", ... } }`. Comandos: `buyIn`, `rebuy`, `leave`, `setBet`, `clearBets`, `confirmBets`, `editBets`, `deal`, `insurance`, `action`, `nextRound`. Reenviar o mesmo `id` não repete o efeito.
- `POST /api/reset` — reinicia a simulação.

## Rumo ao multiplayer online
O motor não conhece rede nem interface. Para multiplayer, associe cada lugar a uma sessão autenticada no servidor, valide o dono do lugar em cada comando e troque HTTP por WebSocket. O modelo de comandos idempotentes já é o necessário.
