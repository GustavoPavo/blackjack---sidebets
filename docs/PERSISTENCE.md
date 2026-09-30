# Persistência, sessões e recuperação

Somente créditos fictícios. O **servidor é a fonte de verdade**: saldo, histórico e rodada ficam no banco;
o navegador guarda apenas a sessão (token) e preferências de cache.

## Banco
- SQLite via `node:sqlite` (Node.js ≥ 22.13; sem dependência nativa). Arquivo padrão: `apps/server/data/blackjack.sqlite`
  (`DATABASE_PATH` muda). WAL + `synchronous=FULL`.
- **Migrações** versionadas em `apps/server/src/db/migrations.ts` (tabela `schema_migrations`; cada migração roda numa transação;
  o servidor recusa um banco de versão futura). Nunca edite uma migração publicada: crie a próxima.
- **Camada de acesso**: `GameRepository` (`src/repository.ts`) é a única porta para o banco; `SqliteRepository` a implementa.
  Trocar de banco = outra implementação, sem mexer no motor nem nas rotas.
- Valores monetários: `INTEGER` em centavos; `CHECK (balance >= 0)`.

| Tabela | Conteúdo |
|---|---|
| `players` | id estável, nome, saldo |
| `sessions` | **hash** SHA-256 do token de sessão (o token em si não é gravado) |
| `ledger_entries` | buy-in/rebuy (PK = jogador + id do comando → nunca duplica) |
| `preferences` | preferências do jogador (JSON validado) |
| `processed_commands` | ids de comandos já aplicados (idempotência que sobrevive a reinícios; limpeza após 30 dias) |
| `table_state` | snapshot JSON da mesa (lugares, apostas, mãos, dealer, **shoe restante**) |
| `rounds`, `round_hands`, `round_results` | histórico: uma linha por aposta resolvida (principal por mão, side bets, insurance) |

## Transação por comando
Cada comando aceito grava, **numa única transação**: carteiras alteradas + lançamentos de crédito + id do comando + snapshot
da mesa + (se a rodada terminou) o histórico. Falhou? Nada é gravado e a memória é recarregada do último estado gravado
(`GameService.commit`). Testes: `apps/server/test/persistence.test.ts` (falha de disco simulada, repetição de comandos, reinício).

- **Idempotência**: o id do comando é escopado por jogador. Repetir o mesmo id (mesmo após reiniciar) devolve `duplicate: true`
  e não debita/credita de novo. O cliente reenvia o **mesmo** id em falhas de rede.
- **Rodada registrada uma única vez**: `UNIQUE (epoch, table_round)` + marcador `last_recorded_round` gravado na mesma transação.

## Recuperação após reinício durante uma rodada — escolha: **RETOMAR**
Ao iniciar, o servidor recarrega jogadores + o snapshot da mesa e continua exatamente de onde parou (mesma mão, mesmo shoe,
carta fechada ainda escondida, decisões de Insurance pendentes).

Por quê: como snapshot e carteira são gravados atomicamente, o estado salvo é sempre consistente; retomar não exige
estimar o que já foi liquidado (23+1/Pares pagam na distribuição; Surrender devolve metade na hora), evitando erro de reembolso.
Cancelar e devolver só é necessário se o estado for **ilegível**: nesse caso o servidor **se recusa a iniciar** com uma mensagem
clara (`Table.restore` valida versão, lugares, jogadores e apostas) em vez de perder créditos em silêncio.

`Table.abortRound()` (devolve exatamente o não liquidado: mãos não desistidas incl. Double/Split, Insurance e Buster Lucky)
existe e é testado (conservação de créditos), mas só é exposto como ferramenta de desenvolvimento
(`ENABLE_DEV_TOOLS=1`, nunca em produção): `POST /api/dev/cancel-round`.

## Sessão de convidado (autenticação)
- `POST /api/guest {name}` cria o jogador (id público = UUID) e devolve um **token secreto** (256 bits) **uma única vez**.
- Todas as rotas de jogador exigem `Authorization: Bearer <token>`. O servidor **ignora qualquer `playerId` enviado pelo cliente**:
  a identidade vem do token. O id público aparece nas visões, mas não dá acesso a nada.
- Criação de convidados limitada por origem de rede (30/hora).
- **Limitações desta etapa**: um convidado pertence a um aparelho/navegador; perder o token (limpar dados do app) perde o acesso à
  carteira. **Não há sincronização entre dispositivos** nem recuperação de conta: isso exigiria autenticação adequada (e-mail,
  Sign in with Apple/Google etc.), fora do escopo. Sem expiração de sessão por enquanto (há `revoked_at` e `POST /api/session/logout`).
- Um único servidor: o estado da mesa está em memória + SQLite; não rode duas instâncias sobre o mesmo arquivo.
- O arquivo do banco contém o **shoe restante** (cartas futuras): proteja-o como dado do servidor.
