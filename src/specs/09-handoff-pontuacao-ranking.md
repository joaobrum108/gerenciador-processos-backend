# Handoff: Pontuação de O.S e Ranking Geral

Escrito em: 10/09/2026.

Leia este documento **inteiro** antes de tocar em qualquer arquivo, e depois leia [`08-regra-negocio-pontuacao-os.md`](./08-regra-negocio-pontuacao-os.md), que tem a regra de negócio decidida.

Muita coisa mudou em 10/09/2026, em três projetos ao mesmo tempo. Nada foi commitado. Se você abrir o código sem ler isto, vai reintroduzir o que acabou de ser removido.

## 1. A decisão que manda em tudo

**Não existe mais espelho, sincronização ou cópia local de dados do IXC.** Foi removido em 10/09/2026 por decisão do usuário, e ele foi explícito: *"esse negócio de espelho não é uma opção mais"*, nem neste projeto nem em nenhum outro.

O motivo é medido: o sincronizador reescrevia ~60 mil linhas a cada 15 minutos — a janela de releitura de 90 dias inteira, todo ciclo — cerca de 5,8 milhões de upserts por dia, com 6 índices sendo atualizados por linha, para capturar algumas dezenas de linhas novas.

**Não proponha espelho, tabela de cópia, materialização ou job de sincronização como solução para lentidão.** A resposta para desempenho é **Redis**, que ainda não foi implantado.

O que foi apagado: `repositorio.espelho.ts`, `services.sincronizacao.ixc.ts`, `repositorio.sincronizacao.ixc.ts`, `agendador.sincronizacao.ts`, `scripts/sincronizar.ts`, os dois repositórios `.local`, `services.divergencias.local.ts`, `database/cache.ixc.ts` e três suítes de teste.

As tabelas `ocorrencias_ixc` (299.148 linhas, 263 MB) e `sincronizacoes_ixc` ficaram **órfãs de propósito** — nada lê nem escreve nelas. O usuário quer removê-las depois; **não dropar sem ele pedir**, e quando for, por migration no `api-db-redfox-process`, nunca `DROP` manual.

## 2. Os três projetos

| Pasta | O que é |
|---|---|
| `api-db-redfox-process` | Prisma. **Único lugar onde o schema do Postgres é definido.** 14 migrations. |
| `gerenciador-processos-backend` | Node/Express. Fala com Postgres (`pg`, sem Prisma) e MySQL do IXC (somente leitura). |
| `gerenciamento-processos-redfox` | Quasar/Vue 3. |

## 3. Armadilhas do IXC que já custaram tempo hoje

### 3.1 Duas tabelas de pessoas, com IDs independentes

- `usuarios` — quem loga no IXC. É de onde sai o **auditor** (`m.id_operador`).
- `funcionarios` — cadastro de pessoal. É onde mora o **técnico de campo** (`m.id_tecnico`).

A mesma pessoa tem dois números: DAVI é `usuarios.id = 924` e `funcionarios.id = 94424`.

Isso mordeu **duas vezes** hoje. O nome do auditor tem que vir de `usuarios` via `id_operador`, resolvido por `buscarNomesOperadores` em `repositories/operadores.ixc.ts`. Quem lê `funcionarios` via `id_tecnico` pega técnico de campo no lugar do auditor.

E os campos têm nomes enganosos: em `/auditorias`, `auditorIxcId` é `id_tecnico`; em `/divergencias`, `auditorIxcId` é `id_operador`. **O mesmo nome significa coisas diferentes nas duas rotas.** Junte por `operadorIxcId`, nunca por `auditorIxcId`, nunca por nome.

### 3.2 `NULL NOT LIKE` engole linha

`NULL NOT LIKE '...'` resulta em `NULL`, que não passa no `WHERE`. As consultas do IXC perdiam linha em silêncio por isso: **233 auditorias só em agosto**. Corrigido com `COALESCE(coluna, '')` em todos os `NOT LIKE`. Qualquer filtro novo sobre coluna de `LEFT JOIN` precisa do mesmo cuidado.

### 3.3 `data_fechamento` é do chamado, não da mensagem

Ocorrências diferentes do mesmo chamado carregam o mesmo carimbo de data.

### 3.4 Datas vêm como `dd/MM/yyyy HH:mm:ss`

`new Date()` devolve `Invalid Date`. Use `paraDataHoraIso` de `utils/divergencias.ts`.

## 4. O que foi feito hoje e está funcionando

### Backend

1. **Tudo ao vivo no IXC.** `/divergencias` voltou para `services.divergencias.ixc.ts`; `ranking.service.ts` usa `repositorio.auditorias.ixc.ts`.
2. **`COALESCE` nos `NOT LIKE`** das duas consultas — recuperou 233 auditorias em agosto.
3. **`assuntoIxcId` no `resumir()`** do IXC, que o Ranking usa para cruzar com a pontuação por assunto.
4. **Lista nominal de 16 auditores removida do `WHERE`.** No lugar: `id_operador IS NOT NULL` e `assunto NOT LIKE '%DIVERGENCIA DE O.S%'`. Auditor novo passa a aparecer sozinho — antes ficava invisível até alguém editar código. Efeito medido: DANIEL PABLO (300 ocorrências no mês) estava fora.
5. **Ranking resolve nome por `id_operador`** contra `usuarios`. Antes mostrava "Nao identificado" em 2º lugar.
6. **`pontuacao-os.repository.ts` lê o IXC ao vivo**, filtrando por três palavras-chave (seção 5). `listarServicosDoEspelho` virou `listarServicosDoIxc`. 168 serviços em ~100ms.
7. **Rota `/regras-ranking` montada** — o controller e o service já existiam sem rota nenhuma.
8. **Cache em memória removido** (`database/cache.ixc.ts`). Ele causava as duas telas mostrarem números diferentes: cada rota tinha chave e expiração próprias, então liam instantes diferentes.

### Frontend

1. Divergências Técnicas: filtro **"Agrupar por"** (motivo / técnico / auditor) unificou três seções numa; filtro de auditor; paginação nas tabelas; export Excel de 11 abas; export PNG que segue o agrupamento.
2. Monitoramento: export Excel de 10 abas; tooltip do Status Operacional explicando por que os totais não batem com Divergências.
3. Ranking Geral: período **personalizado**, que faltava.
4. Pontuação de O.S: card **"Regras de pontuação"** com listagem e formulário de criação.
5. `utils/monitoramento.ts`: `montarTopDivergencias` passou a **ordenar** antes de cortar — antes pegava 5 quaisquer, não os 5 maiores.
6. Sidebar: ícone por módulo, rodapé travado, botão de sair no header.

### Verificado

- Backend: `npm run typecheck` limpo, `npm test` **204 testes, 0 falhas**
- Frontend: `npm run typecheck`, `npx oxlint`, `npm run build` — todos limpos
- `api-db-redfox-process`: `npx prisma validate` limpo

## 5. As três palavras-chave

O departamento de auditoria é definido por três palavras no `assunto` da O.S:

```
AUDITORIA        DIVERGENCIA DE O.S        EQUIPAMENTO
```

Em `PALAVRAS_CHAVE_ASSUNTO`, no topo de `repositories/pontuacao-os.repository.ts`.

**Não troque por filtro de setor.** `empresa_setor.setor LIKE '%AUDITORIA%'` traz chamados de TI que caem num setor com esse nome (`CHECKLIST`, `REPARO IMPRESSORA`, `TESTE #`). Medido: dos 94 assuntos auditados desde 01/06, 92 casam com as palavras (69.546 ocorrências) e só 2 ficam de fora (9 ocorrências) — o ruído.

Acentuação não importa: o MySQL compara sem acento.

## 6. O próximo passo, em ordem

### 6.1 Aplicar a migration pendente

`api-db-redfox-process/prisma/migrations/20260910120000_pontuacao_ranking/` está **escrita e validada, não aplicada**.

```bash
cd api-db-redfox-process
npx prisma migrate status   # deve listar so ela como pendente
npx prisma migrate deploy
```

Ela faz:

- `regras_ranking.acrescenta` — boolean, default `false`
- `fechamentos_ranking` → `pontuacoes_ranking`
- `fechamento_ranking_itens` → `pontuacao_ranking_itens`, com `fechamento_id` → `pontuacao_id`
- `pontuacao_ranking_itens.usuario_id` — FK para `usuarios`, `ON DELETE SET NULL`
- rename de todas as constraints e índices herdados

`schema.prisma` já está atualizado no mesmo commit.

### 6.2 Backend

1. `regras-ranking.repository.ts` e `service`: ler e gravar `acrescenta`
2. Controller: aceitar `acrescenta` no `POST` e `PUT`
3. Validar que `pontos` é sempre positivo — o sinal vem do booleano, não do número

### 6.3 Frontend

1. Card de regras: dois botões, **Descontar** e **Acrescentar**, gravando `acrescenta` `false`/`true`
2. Editar e remover regra existente
3. **Aviso na tela de que a regra ainda não afeta o ranking** (seção 7)

## 7. O que NÃO fazer ainda

**As regras não entram no cálculo do ranking.** Falta definir como uma regra chamada "Falta sem justificativa" se liga a `registros_ponto.status = 'FALTA'`. Foi decisão explícita do usuário adiar isso: primeiro o cadastro funciona, depois se decide o vínculo.

Uma proposta de coluna `tipo` (enum `FALTA | ATRASO | ERRO | MANUAL`) foi apresentada e **recusada** — não a reintroduza sem ele pedir.

Consequência: o gerente pode cadastrar "Falta: 1000, descontar" e **nada acontece**. A tela precisa dizer isso, senão ele espera efeito.

## 8. Bloqueios que não dependem de código

1. **`usuarios.funcionario_ixc_id` vazio** — 0 de 2. Sem o vínculo, falta e atraso nunca chegam ao auditor. É preenchido na aba de colaborador do usuário do sistema.
2. **`registros_ponto` vazia** — 0 registros. Sem ponto, não há falta nem atraso para descontar.

O cálculo pode ser escrito antes disso e passa a funcionar sozinho quando o dado chegar. Só não dá para ver resultado.

## 9. Coisas quebradas ou pendentes, registradas

1. **`routesIxc.use(autenticar)` está comentado** em `routes/rotas.ixc.ts`. O usuário confirmou que é proposital. Deixa 5 rotas abertas com dado de cliente e funcionário, e faz `/funcionarios` e `/equipamentos` responderem 401 sempre, porque `autorizar` falha sem `req.usuario`. **Não mexer.** *(Em 10/09 ele reativou a linha por conta própria; confirme o estado antes de assumir.)*
2. **`concluirCorrida` não limpa `erro`** em `repositorio.espelho.ts` — arquivo já removido, mas a constraint `CHECK ((situacao = 'FALHOU') = (erro IS NOT NULL))` em `sincronizacoes_ixc` continua no banco. Irrelevante enquanto a tabela estiver órfã.
3. **Três bugs na tela de Divergências**, levantados e não corrigidos:
   - modal "Ver O.S" lista todas as ocorrências do motivo, de todos os técnicos, mas o título é um técnico e o KPI mostra só a quantidade dele
   - *(a busca limitada aos 3 ofensores foi corrigida junto com o agrupamento)*
   - *(os filtros que não alcançavam KPIs e gráficos foram corrigidos junto com o agrupamento)*
4. **Período "Ano" leva ~30s** em `/divergencias` sem cache. É o caso que o Redis resolve.
5. **Sem commit.** Os três projetos estão com trabalho não commitado.

## 10. Como verificar o que você mudar

```bash
# backend
cd gerenciador-processos-backend
npm run typecheck
npm test              # 204 testes, 0 falhas hoje
npm run dev           # sobe em :3200 com tsx watch

# frontend
cd gerenciamento-processos-redfox
npm run typecheck
npx oxlint --config oxlint.config.ts <arquivos>
npm run build

# api de banco
cd api-db-redfox-process
npx prisma validate
npx prisma migrate status
```

O `.env` do backend tem as credenciais do IXC (`DB_HOST_IXC` e afins). São consultas somente leitura, e dá para exercitar service e repositório direto com `npx tsx <script>` — foi assim que quase tudo aqui foi medido.

**Meça antes de afirmar.** Praticamente todo diagnóstico deste documento veio de rodar consulta contra o dado real, e mais de uma hipótese que parecia óbvia caiu no teste.
