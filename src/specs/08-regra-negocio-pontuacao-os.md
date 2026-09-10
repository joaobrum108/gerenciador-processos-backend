# Regra de negócio: Pontuação de O.S e Ranking Geral

Escrito em: 10/09/2026.

Este documento registra a regra de negócio decidida para a tela de **Pontuação de Serviços (O.S)** e para o **Ranking Geral**, na ordem em que o trabalho deve ser feito: primeiro a API de banco, depois o backend, depois o frontend.

Nada aqui está implementado além do que a seção 8 marca como pronto.

## 1. A conta, em uma linha

```
saldo do auditor no período =
    Σ (O.S auditadas × pontos do assunto)
  + Σ (eventos do auditor × pontos da regra, com sinal)
```

A primeira parcela premia produção. A segunda aplica as regras do gerente — falta, atraso, erro — automaticamente, sem ninguém lançar nada à mão.

O saldo é **calculado por período**, não acumulado. Ao fechar o mês, o resultado é congelado para consulta futura (seção 5).

## 2. Onde cada número nasce

| Parcela | Fonte | Situação |
|---|---|---|
| O.S auditadas | IXC ao vivo, agrupado por `id_assunto` | pronto |
| pontos do assunto | `regras_pontuacao_os` (86 regras ativas) | pronto |
| erros encontrados | classificação `COM_DIVERGENCIA` da ocorrência | pronto |
| faltas e atrasos | `registros_ponto` (`status`, `atraso_minutos`) | tabela existe, **vazia** |
| pontos de cada regra | `regras_ranking` | tabela existe, **vazia** |

## 3. Escopo da auditoria: três palavras-chave

O departamento de auditoria é definido por três palavras no `assunto` da O.S:

```
AUDITORIA        DIVERGENCIA DE O.S        EQUIPAMENTO
```

Vivem em `PALAVRAS_CHAVE_ASSUNTO`, em `repositories/pontuacao-os.repository.ts`. Acrescentar ou remover uma é editar essa constante — o `WHERE` se monta sozinho.

**Por que não filtrar por setor.** `empresa_setor.setor LIKE '%AUDITORIA%'` traz chamados de TI que caem num setor com esse nome: `CHECKLIST`, `REPARO IMPRESSORA`, `TESTE #`, `SOLICITAÇÃO DE HARDWARE`. Medido em 10/09/2026: dos 94 assuntos auditados desde 01/06, **92 casam com as palavras** (69.546 ocorrências) e só 2 ficam de fora (`TESTE #` e `CHECKLIST DESLIGAMENTO`, 9 ocorrências) — exatamente o ruído.

Acentuação não importa: o MySQL do IXC compara sem acento, então `DIVERGÊNCIA` casa com `DIVERGENCIA`.

## 4. A ponte entre o auditor do IXC e o colaborador local

Este é o ponto que mais confunde, porque o IXC tem **duas tabelas de pessoas com numeração independente**:

- `usuarios` — quem loga no IXC. É de onde sai o **auditor** (`id_operador`).
- `funcionarios` — cadastro de pessoal. É onde mora o **técnico de campo**.

A mesma pessoa tem dois números. Exemplo medido:

```
op 924 (usuarios) = DAVI RODRIGUES DE CARVALHO -> funcionarios 94424
op 927 (usuarios) = DANIEL PABLO SILVA DE ANDRADE -> funcionarios 94429
```

A cadeia completa, que fecha sem inventar nada:

```
ocorrência de auditoria
  → su_oss_chamado_mensagem.id_operador     (IXC usuarios.id)
  → usuarios.funcionario                     (IXC funcionarios.id — 886/886 preenchidos)
  → usuarios.funcionario_ixc_id              (Postgres local)
  → registros_ponto.usuario_id
```

O vínculo local é feito na aba de colaborador do usuário do sistema, que já existe.

**Estado hoje:** `usuarios` local tem 2 registros e **0 com `funcionario_ixc_id` preenchido**. Enquanto isso não for alimentado, nenhum auditor casa com o próprio ponto.

## 5. Onde o saldo é gravado

O saldo **é gravado**, com data, numa tabela própria — não numa coluna do cadastro do colaborador. O ranking é competição por período: cada mês começa do zero, e o mês anterior tem que continuar consultável com o número da época.

Uma coluna em `usuarios` caberia **um** número, e a tela tem cinco filtros de período (dia, semana, mês, ano, personalizado). Ela acertaria um e responderia errado nos outros quatro.

### 5.1 As duas tabelas

Já existem, criadas na migration `20260902120000_init`, vazias e sem nenhum código usando. A migration nova as renomeia para nomes que descrevem o conteúdo, não o evento:

```
fechamentos_ranking       ->  pontuacoes_ranking
fechamento_ranking_itens  ->  pontuacao_ranking_itens
```

```
pontuacoes_ranking          cabeçalho do período
  id, periodo_inicio, periodo_fim, configuracao_ranking_id,
  gerado_por_usuario_id, gerado_em, dados_fonte_consultados_em, hash_calculo

pontuacao_ranking_itens     uma linha por colaborador naquele período
  id, pontuacao_id, usuario_id, funcionario_ixc_id,
  funcionario_nome_snapshot, cargo_snapshot,
  posicao, pontuacao_final, alta_performance, premiado,
  composicao (jsonb), criado_em
```

### 5.2 Por que cada coluna existe

| Coluna | Para quê |
|---|---|
| `pontuacao_final` | o saldo do colaborador naquele período |
| `usuario_id` | vínculo com o colaborador local, congelado no momento do cálculo |
| `funcionario_ixc_id` | identidade no IXC, para o histórico sobreviver a mudança de cadastro |
| `posicao` | o lugar no pódio da época, sem precisar reordenar tudo de novo |
| `composicao` (jsonb) | a memória de cálculo — O.S auditadas, erros, faltas, atrasos |
| `funcionario_nome_snapshot`, `cargo_snapshot` | nome e cargo da época; a pessoa muda de cargo ou sai |
| `configuracao_ranking_id` | qual regra valia quando fechou; mudar a regra depois não reescreve o passado |

### 5.3 Período aberto × período fechado

- **Aberto** (o mês corrente): calculado ao vivo a cada consulta. O.S continuam fechando e ponto continua sendo lançado, então gravar seria congelar um número que já nasce velho.
- **Fechado**: lido de `pontuacao_ranking_itens`. Imutável.

A tela não muda: continua mostrando "DAVI — 6.427 pontos, 1º lugar". Muda só de onde o número vem.

## 6. As regras do gerente

### 6.1 Sinal por booleano, não por operador

`regras_ranking` hoje tem `nome` e `pontos`. Falta o sinal.

```sql
ALTER TABLE "regras_ranking"
  ADD COLUMN "acrescenta" BOOLEAN NOT NULL DEFAULT false;
```

`false` desconta, `true` acrescenta. O `pontos` fica **sempre positivo** e o sinal vem do booleano.

**Por quê:** impede o gerente de criar `Falta: +1000` por engano ao esquecer o menos. No card, dois botões — **Descontar** e **Acrescentar** — em vez de um campo onde ele digita o sinal.

### 6.2 O vínculo com o evento fica para depois

Uma regra hoje é **nome + pontos + sinal**. Ela é criada, editada e listada, mas ainda **não entra no cálculo do ranking** — falta definir como "Falta sem justificativa" se liga a `registros_ranking.status = 'FALTA'`.

Isso é deliberado: primeiro o cadastro funciona, depois se decide o vínculo. Enquanto não houver, a tela de Pontuação de O.S mostra as regras e o Ranking as ignora.

**Não confundir com pronto.** Qualquer texto de interface deve deixar claro que a regra ainda não desconta nada, senão o gerente cadastra "Falta: 1000" e espera ver efeito.

### 6.3 Conflito com `configuracoes_ranking`

`configuracoes_ranking` já guarda as mesmas taxas, e tem 1 linha vigente:

```
pontos_por_erro           10.00
pontos_por_minuto_atraso  -2.00
pontos_por_falta       -1000.00
limite_alta_performance 4000.00
```

`ranking.service.ts` lê essa tabela hoje; `regras_ranking` não é lida por ninguém.

Enquanto as regras não entrarem no cálculo (seção 6.2), não há conflito — são mecanismos que ainda não se cruzam. **Quando entrarem, é decisão obrigatória:** ou as regras substituem `pontos_por_erro`, `pontos_por_minuto_atraso` e `pontos_por_falta`, ou os dois passam a valer e um dia divergem. `limite_alta_performance` não é regra de evento e fica onde está de qualquer forma.

## 7. Como o mês fecha, automaticamente

### 7.1 Fechamento preguiçoso, sem agendador

O período fecha **na primeira consulta que o encontrar fechável**. Não precisa de cron nem de processo de fundo.

```
ao consultar o Ranking de um período:

  ja existe pontuacoes_ranking para esse periodo?
    SIM  -> le os itens gravados e devolve
    NAO  -> o periodo ja terminou ha mais de N dias?
              SIM -> calcula, grava o fechamento, devolve o gravado
              NAO -> calcula ao vivo e devolve sem gravar
```

**Por que assim.** O agendador que existia neste projeto foi removido junto com o espelho, e reintroduzir um processo de fundo só para isso traz de volta os problemas que a gente acabou de tirar: corrida travada, falha silenciosa, estado para monitorar. O fechamento preguiçoso é idempotente, se autocorrige e não depende de o servidor estar de pé numa hora específica.

### 7.2 A carência de N dias

Um período **não deve fechar no dia seguinte ao fim**. O fluxo do IXC é `O.S → auditoria → divergência`, e a O.S de divergência fecha depois da auditoria — medimos 6,6% dos casos atravessando o corte no acumulado de 9 dias.

Fechar cedo demais congela um mês incompleto. Proposta: **carência de 10 dias** após `periodo_fim`. Medição de 10/09/2026 sustenta o número: as divergências abertas somam 4 contra 4.316 fechadas desde junho, e o time fecha praticamente no mesmo dia — 10 dias cobrem com folga.

O valor fica numa constante, não espalhado no código.

### 7.3 O que fica gravado junto

No momento de gravar, o service registra `dados_fonte_consultados_em` (quando o IXC foi lido) e `configuracao_ranking_id` (qual regra valia). Assim dá para auditar depois por que aquele mês deu aquele número.

`hash_calculo` recebe um resumo das entradas — período, configuração e regras aplicadas. Se alguém recalcular e o hash bater, o fechamento é o mesmo; se não bater, algo mudou na origem e vale investigar.

### 7.4 Refazer um fechamento

Fechamento é imutável por padrão. Refazer é operação explícita do gerente: apaga o `pontuacoes_ranking` daquele período (cascata nos itens) e deixa a próxima consulta refazer. Não é automático — se fosse, o histórico mudaria sozinho e perderia a graça.

## 8. Ordem do trabalho

### 8.1 API de banco (`api-db-redfox-process`)

Uma migration **nova** — nunca editar as 13 existentes.

**Por quê:** `_prisma_migrations` guarda `checksum` de cada migration aplicada. Editar uma já aplicada muda o hash e o Prisma passa a recusar rodar em qualquer banco que a tenha. Uma migration nova entrega o mesmo resultado: em banco zerado, `prisma migrate deploy` roda todas em ordem e chega no mesmo schema; em banco existente, aplica só a diferença, sem reset.

```sql
-- 1. sinal da regra: o valor fica sempre positivo, o sinal vem daqui
ALTER TABLE "regras_ranking"
  ADD COLUMN "acrescenta" BOOLEAN NOT NULL DEFAULT false;

-- 2. nomes que descrevem o conteudo, nao o evento
ALTER TABLE "fechamentos_ranking"      RENAME TO "pontuacoes_ranking";
ALTER TABLE "fechamento_ranking_itens" RENAME TO "pontuacao_ranking_itens";
ALTER TABLE "pontuacao_ranking_itens"  RENAME COLUMN "fechamento_id" TO "pontuacao_id";

-- 3. vinculo com o colaborador local, congelado no fechamento
ALTER TABLE "pontuacao_ranking_itens"
  ADD COLUMN "usuario_id" UUID REFERENCES "usuarios"("id") ON DELETE SET NULL;

CREATE INDEX "pontuacao_ranking_itens_usuario_idx"
  ON "pontuacao_ranking_itens"("usuario_id");
```

Renomear constraints, índices e triggers herdados dos nomes antigos entra na mesma migration. `schema.prisma` é atualizado no mesmo commit, com `@@map` apontando para os nomes novos.

Opcional, na mesma leva: dropar `ocorrencias_ixc` e `sincronizacoes_ixc`, órfãs desde a remoção do espelho — 299.148 linhas, 263 MB, nenhum código lendo.

### 8.2 Backend (`gerenciador-processos-backend`)

1. `regras-ranking.repository.ts` e `service` passam a ler e gravar `acrescenta`
2. *(depois da seção 6.2)* `ranking.service.ts` passa a aplicar as regras
3. Novo repositório para agregar `registros_ponto` por usuário e período — faltas e soma de atrasos
4. Resolver a ponte da seção 4 dentro do service, para cruzar auditor do IXC com colaborador local
5. `ItemRanking.composicao` deixa de ter `atrasoMinutos` e `faltas` zerados por construção
6. Fechamento preguiçoso (seção 7): ao consultar período fechável sem registro, calcular, gravar em `pontuacoes_ranking` e `pontuacao_ranking_itens`, e devolver o gravado
7. Leitura de período já fechado, direto das tabelas
8. Rota de refazer fechamento, restrita ao gerente

### 8.3 Frontend (`gerenciamento-processos-redfox`)

1. Card "Regras de pontuação" na tela de Pontuação de O.S: criar, editar e remover, com os dois botões de sinal
2. Aviso na tela de que a regra ainda não afeta o ranking
3. Ranking Geral: etiqueta indicando se o período está **aberto** (calculado agora) ou **fechado** (congelado em tal data)
4. Botão de refazer fechamento, restrito ao gerente
5. Memória de cálculo passa a mostrar faltas e atrasos reais

## 9. O que já está pronto

- Catálogo de assuntos por palavra-chave, ao vivo do IXC, em ~100ms (`listarServicosDoIxc`)
- `regras_pontuacao_os` com 86 regras ativas, editáveis na tela
- Rota `/regras-ranking` montada, com `GET`, `POST`, `PUT` e `DELETE`
- Card de regras na tela de Pontuação de O.S, com listagem e formulário de criação
- Ranking calculando O.S auditadas e erros encontrados, com nome do auditor resolvido por `id_operador`

## 10. Bloqueios

1. **`usuarios.funcionario_ixc_id` vazio** — 0 de 2. Sem o vínculo, falta e atraso não chegam ao auditor.
2. **`registros_ponto` vazia** — 0 registros. O cálculo pode ser escrito, mas não há o que descontar até o ponto ser alimentado.
3. **Vínculo regra → evento não definido** (seção 6.2). As regras existem e são editáveis, mas não afetam o ranking.

## 11. Extra: como o Ranking Geral fica automático

Fechado o desenho acima, o ranking passa a funcionar sem lançamento manual nenhum:

```
1. O gerente cadastra as regras uma vez:
     Falta            1000   descontar   tipo FALTA
     Minuto de atraso    2    descontar   tipo ATRASO
     Erro encontrado    10   acrescentar  tipo ERRO

2. O auditor trabalha. O IXC registra as O.S auditadas.
   O ponto registra entrada, atraso e falta.

3. Ao abrir o Ranking Geral, o backend:
     a) agrupa as ocorrências do período por auditor e por assunto
     b) multiplica cada grupo pelos pontos do assunto
     c) resolve a ponte auditor -> colaborador local
     d) busca faltas e atrasos do período em registros_ponto
     e) aplica cada regra pelo tipo, com o sinal do booleano
     f) ordena por saldo e marca alta performance acima do limite

4. Ao fechar o mês, o gerente grava o fechamento.
   Consultar mês anterior passa a ler o congelado, não recalcular.
```

O gerente só edita os valores das regras. O resto acontece sozinho.

**Um efeito que precisa ser aceito conscientemente:** enquanto o período não for fechado, consultar o mesmo mês em dias diferentes pode dar números diferentes — porque O.S continuam fechando e ponto continua sendo lançado. É o comportamento correto para período aberto, e é exatamente por isso que o fechamento existe.
