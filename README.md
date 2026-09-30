# Blackjack com side bets (créditos fictícios)

Mesa de Blackjack com 5 lugares e dealer compartilhado. **Somente créditos fictícios** — não há depósito, saque nem dinheiro real. Os 5 lugares são controlados por um único jogador na mesma tela (não é multiplayer online). Carteira, rodadas e histórico ficam num **banco SQLite no servidor**.

- Blackjack: 6 baralhos, 3:2, dealer para no soft 17, Hit/Stand/Double/Split/Insurance/Surrender.
- Side bets: 23+1, Pares, Buster Lucky. Buy-in/rebuy de até R$ 1.000,00 por operação.
- **Jogador com carteira única:** o nome é pedido uma vez (salvo no navegador, com opção "Editar nome"); o buy-in inicial é feito uma vez na carteira do jogador, que pode ocupar vários lugares usando o mesmo saldo.
- **Repetir aposta / X2** na fase de apostas, **mensagem de ganho total** ao fim da rodada e distribuição **carta por carta** (lugar 1 à direita, 5 à esquerda; distribuição e turnos 1 → 5).
- **Celular:** horizontal = mesa completa; vertical = dealer + mãos do lugar ativo com navegação entre lugares/mãos e controles grandes embaixo (áreas seguras, sem rolagem horizontal).
- **Animações** carta a carta a partir do shoe, fichas empilhadas nas apostas, sons discretos sintetizados, vibração, velocidade normal/rápida e movimento reduzido (preferências salvas).
- **Regras visuais** com exemplos, **tutorial interativo** opcional e **modo treino** (estratégia básica com dicas desligáveis), ambos em sessão separada, sem alterar saldo/histórico reais.
- **Estatísticas e histórico** (rodadas, mãos, V/D/E, blackjacks, líquido por aposta; buy-in/rebuy fora do lucro).
- **Persistência** com recuperação após reinício do servidor: [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md). **App Android/iOS (Capacitor):** [`docs/MOBILE.md`](docs/MOBILE.md). Estratégia: [`docs/STRATEGY.md`](docs/STRATEGY.md). Recursos visuais/sons: [`docs/ASSETS.md`](docs/ASSETS.md).
- Regras e decisões da mesa: [`docs/RULES.md`](docs/RULES.md). Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Vocabulário
- **Lugar** (seat): uma das 5 posições da mesa. Índice interno 0..4; exibido como 1..5. Visualmente, da esquerda para a direita: **5, 4, 3, 2, 1**.
- **Mão** (hand): mão jogada num lugar (1, ou até 4 após splits).
- **Jogador** (player): a pessoa, com id estável e **uma carteira**. Um jogador pode ocupar vários lugares.

## Visual
Mesa com borda de madeira, contorno dourado e feltro; dealer no topo e os cinco lugares dentro da mesa em semicírculo (esquerda → direita: 5, 4, 3, 2, 1); fichas circulares, uma cor por valor; botão **Regras e pagamentos** (tabelas das side bets 23+1, Pares e Buster Lucky e regras da mesa). O estilo está em `apps/web/src/styles.css`.

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
Node.js **≥ 22.13** (usa `node:sqlite`) e npm.

## Instalar e executar
```bash
npm install
npm run dev      # servidor :3001 + Vite :5173 -> http://localhost:5173
npm start        # build do front + servidor servindo tudo -> http://localhost:3001
```

## Testar
```bash
npm test          # engine + servidor + interface
npm run typecheck
npm run build
```

## Configuração do servidor (variáveis de ambiente)
| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 3001 | porta |
| `DATABASE_PATH` | `./data/blackjack.sqlite` | arquivo SQLite (criado/migrado na inicialização; fora do git) |
| `ALLOWED_ORIGINS` | dev: localhost/Capacitor; produção: vazio | origens permitidas (CORS), separadas por vírgula |
| `ENABLE_DEV_TOOLS` | desligado | ferramentas de dev (nunca em produção) |
| `NODE_ENV` | — | `production` endurece padrões |

## Sessão e identidade
O jogador entra como **convidado**: o servidor cria um id estável e um **token secreto** (guardado só como hash) que o aparelho guarda. O id público **não é autenticação**; o nome só é exibição e não cria carteira. Não há sincronização entre dispositivos.

## API (resumo)
`POST /api/guest`, `GET /api/table`, `POST /api/commands` (comandos idempotentes por `id`), `GET|PUT /api/preferences`, `GET /api/stats`, `GET /api/history`, `POST /api/sandbox/:kind/start` (treino/demo). Detalhes em `docs/ARCHITECTURE.md`.

## Atualizar sua cópia local e executar
```bash
git fetch origin claude/adoring-mendel-3fetcq
git checkout blackjack-atualizado
git branch backup-blackjack-atualizado   # opcional: guarda o estado atual
git reset --hard origin/claude/adoring-mendel-3fetcq
npm install
npm test
npm run dev        # abra http://localhost:5173
```

## Limitações
- Um jogador controla todos os lugares (sem multiplayer, sem sync entre dispositivos).
- Apps Android/iOS gerados e sincronizados, **mas não compilados/testados em aparelho aqui**; ícone/abertura e `appId` provisórios; nada publicado.
- Sons sintetizados (sem arquivos de áudio de terceiros).
- Estratégia básica mostra "sem recomendação" quando o EV é incerto.
