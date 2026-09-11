# Implementação: Pontuação e Ranking Geral

Escrito em: 11/09/2026.

Leia antes [`08-regra-negocio-pontuacao-os.md`](./08-regra-negocio-pontuacao-os.md) e
[`09-handoff-pontuacao-ranking.md`](./09-handoff-pontuacao-ranking.md). Este documento fecha o
que ficou em aberto na seção 7 do handoff: como a regra se liga ao cálculo do ranking.

## 1. O desenho em duas partes

**A pontuação** fica em `pontuacoes_ranking` e `pontuacao_ranking_itens`. **As regras** ficam em
`regras_pontuacao_os` e `configuracoes_ranking`. O backend calcula, grava na pontuação, e a tela
lê a pontuação.

Os nomes `pontuacoes_ranking` e `pontuacao_ranking_itens` vêm da migration
`20260910120000_pontuacao_ranking`, que renomeia `fechamentos_ranking` e
`fechamento_ranking_itens`.

## 2. As tabelas, uma a uma

### 2.1 `pontuacoes_ranking` — o mês

```
periodo_inicio, periodo_fim
configuracao_ranking_id        qual configuração de preços valeu
gerado_por_usuario_id          quem fechou
gerado_em, dados_fonte_consultados_em, hash_calculo
@@unique([periodo_inicio, periodo_fim])
```

O envelope que diz de que mês são as linhas. O `unique` impede fechar o mesmo mês duas vezes.

### 2.2 `pontuacao_ranking_itens` — a pontuação de cada auditor

```
pontuacao_id                   o mês a que pertence
usuario_id                     o usuário do sistema, ON DELETE SET NULL
funcionario_ixc_id
funcionario_nome_snapshot, cargo_snapshot
posicao, pontuacao_final
alta_performance, premiado
composicao                     JSONB, as parcelas que formaram o total
@@unique([pontuacao_id, posicao])
```

É esta a "tabela da pontuação do usuário". Cabeçalho e item, como nota fiscal: uma nota, vários
produtos. Se fosse tabela única, as ~30 linhas do mês repetiriam período, hash e quem gerou, e
perderiam as duas garantias de unicidade. Apagar o mês apaga os itens, por `ON DELETE CASCADE`.

### 2.3 `regras_pontuacao_os` — o preço da O.S, por assunto

```
assunto_os_ixc_id              qual assunto do IXC
assunto_os_nome_snapshot       o nome do assunto na época
pontos                         quanto vale cada O.S desse assunto
vigente_de, vigente_ate
ativo
```

É a parcela que mais pesa. Multiplica pela quantidade de O.S auditadas. Tem vigência, então dá
para mudar o preço sem apagar o antigo.

### 2.4 `configuracoes_ranking` — os três preços automáticos

```
pontos_por_erro
pontos_por_minuto_atraso
pontos_por_falta
limite_alta_performance        a partir de quantos pontos o auditor é alta performance
vigente_de, vigente_ate
```

Uma linha valendo por vez; a busca filtra `vigente_ate IS NULL`. É aqui que entram os três
booleanos de sinal da seção 5.

Registrado: hoje `gravarConfiguracao` faz `UPDATE` nessa linha em vez de fechar e criar outra,
então mudar um preço sobrescreve o anterior. As colunas de vigência existem e não são usadas.

### 2.5 `regras_ranking` — o catálogo livre da tela nova

```
nome          texto livre, único
pontos        sempre positivo
acrescenta    o botão: true soma, false desconta
```

Guarda o preço, mas não o fato de ter sido aplicado a alguém, e o nome é texto livre. Por isso
não entra no cálculo.

### 2.6 `registros_ponto` — o fato do atraso e da falta

```
usuario_id, data
entrada, entrada_almoco, saida_almoco, saida
atraso_minutos
status                         NO_HORARIO | ATRASO | FALTA | JUSTIFICADO
justificativa
@@unique([usuario_id, data])
```

Daqui saem as duas quantidades: `SUM(atraso_minutos)` e a contagem de `status = 'FALTA'` no
período. O `unique` garante um registro por pessoa por dia, então o mesmo atraso não é lançado
duas vezes.

### 2.7 `usuarios` — o vínculo e a jornada

```
funcionario_ixc_id             o ID do funcionário no IXC, gravado no cadastro
funcionario_nome_snapshot
escala                         ESCALA_5X2 e afins
entrada_expediente
saida_almoco, retorno_almoco
saida_expediente
cargo_id, status
```

O `funcionario_ixc_id` é a ponte até o auditor do IXC. A jornada é o horário esperado, contra o
qual a tela de ponto apura o atraso.

### 2.8 No IXC, somente leitura

| Tabela | Para quê |
|---|---|
| `su_oss_chamado_mensagem` | uma linha por mensagem de auditoria, com `id_operador` e `id_chamado`; é onde a contagem acontece |
| `su_oss_chamado` | `data_fechamento`, `id_assunto` e `setor` — definem em que mês a O.S cai e qual preço usa |
| `su_oss_assunto` | o nome do assunto |
| `usuarios` | o nome do auditor e a coluna `funcionario`, que completa a ponte |
| `funcionarios` | o cadastro de pessoal apontado por `usuarios.funcionario` |

## 3. O vínculo do auditor

No cadastro, o usuário do sistema é ligado a um funcionário do IXC e o ID fica em
`usuarios.funcionario_ixc_id`.

A travessia até o auditor que aparece no ranking, medida em 11/09/2026:

```
id_operador (IXC)  ->  usuarios.funcionario (IXC)  ->  usuarios.funcionario_ixc_id (nosso)
```

`usuarios.funcionario` no IXC guarda o `funcionarios.id`. Conferido no usuário 924:
`usuarios.id = 924`, `usuarios.funcionario = 94424`, `funcionarios.id = 94424`, mesmo nome nos
dois cadastros.

Cobertura medida: 789 dos 886 usuários do IXC têm a ponte preenchida, e 786 resolvem num
funcionário existente. A coluna inversa `funcionarios.usuario_id` está vazia nas 1.272 linhas e
não serve.

Auditor sem vínculo pontua, mas não casa com usuário do sistema. A tela mostra a linha assim
mesmo.

## 4. O cálculo

Quatro parcelas, todas taxa por unidade:

| Parcela | Quantidade | Preço |
|---|---|---|
| O.S auditadas | chamados distintos do auditor no período, do IXC | `regras_pontuacao_os`, por assunto |
| Erro | divergências encontradas | `configuracoes_ranking.pontos_por_erro` |
| Atraso | `SUM(registros_ponto.atraso_minutos)` | `configuracoes_ranking.pontos_por_minuto_atraso` |
| Falta | `COUNT(registros_ponto.status = 'FALTA')` | `configuracoes_ranking.pontos_por_falta` |

Regra de valor fixo é a mesma coisa com quantidade 1.

A pontuação final é a soma das parcelas com seus sinais, e pode ficar negativa.
`alta_performance` compara a pontuação final já descontada com `limite_alta_performance`.

O `ranking.service.ts` já calcula `pontosAtrasos` e `pontosFaltas`; eles dão zero porque
`composicao.atrasoMinutos` e `composicao.faltas` nunca são preenchidos. O trabalho é alimentar
esses dois campos a partir de `registros_ponto`.

## 5. O sinal

Ao criar ou editar a regra, o usuário escolhe entre dois botões, acrescentar ou descontar. O
valor é gravado sempre positivo e o booleano decide se soma ou subtrai. Evita cadastrar
"Falta: +1000" por esquecer o menos.

`regras_ranking.acrescenta` já existe na migration pendente. `configuracoes_ranking` recebe o
mesmo tratamento, com três booleanos na mesma migration, já que o banco local será recriado:

```sql
ALTER TABLE "configuracoes_ranking"
  ADD COLUMN "erro_acrescenta"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "atraso_acrescenta" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "falta_acrescenta"  BOOLEAN NOT NULL DEFAULT false;
```

Default `false` é descontar. `pontos` é validado como positivo na gravação.

## 6. O mês

Durante o mês aberto, a pontuação é recalculada a cada consulta e gravada. O cálculo refaz a
conta do zero, nunca soma em cima do que já estava — reprocessar o mesmo mês duas vezes dá o
mesmo número.

No fechamento o mês é congelado: posição, pontuação final, composição e cópia do nome e do
cargo de cada auditor naquela data. A partir daí o mês é lido do banco e não recalcula mais.

O mês seguinte começa do zero, sem apagar nada. O anterior fica como histórico.

O recálculo do mês aberto grava cerca de 30 linhas. Não tem relação com o volume que motivou a
remoção do espelho.

## 7. Contagem de O.S

Uma O.S auditada é um chamado distinto, não uma mensagem.

Hoje `resumir()` faz `COUNT(*)` sobre `su_oss_chamado_mensagem`, então um chamado com várias
mensagens de auditoria é contado várias vezes. Medido em agosto/2026:

```
ocorrências contadas     17.273
chamados distintos       16.949
chamados repetidos          305  (629 ocorrências, 324 contagens a mais)
```

São 1,9% do total, mas concentrados: nas amostras, todas as repetições do mesmo chamado são do
mesmo operador, então a inflação cai inteira num auditor.

A contagem passa a ser por chamado distinto, por auditor. O `GROUP BY` atual inclui diagnóstico
e tarefa, que variam entre mensagens do mesmo chamado, então o mesmo chamado pode aparecer em
dois grupos — a deduplicação precisa ser por auditor, não dentro do grupo.

Entre meses não há duplicação: `data_fechamento` é do chamado e vale igual para todas as
mensagens dele, então o chamado inteiro cai num mês só.

## 8. Observação registrada, sem tratamento nesta entrega

Um chamado reaberto e fechado num mês seguinte muda de `data_fechamento` e seria contado duas
vezes: uma no mês já congelado, outra no mês novo. Não dá para medir a frequência disso hoje,
porque o chamado guarda só a data de fechamento atual.

Decisão: fica como risco conhecido.

## 9. Dependências para funcionar

1. `usuarios.funcionario_ixc_id` preenchido — hoje 0 de 2.
2. Jornada do usuário definida: `entrada_expediente`, `saida_almoco`, `retorno_almoco`,
   `saida_expediente`, `escala`. Os campos já existem em `usuarios`.
3. `registros_ponto` alimentado pela tela de ponto — hoje 0 registros.

Sem isso, atraso e falta saem zerados. O cálculo funciona sozinho quando o dado chegar.

## 10. Fora de escopo

- `regras_ranking` continua como catálogo de nome livre e não entra no cálculo. O backend não
  tem como saber que o texto "Falta" significa `status = 'FALTA'`. A tela avisa isso.
- `colaboradores` e `horarios` guardam horário num segundo lugar. Não são tocados aqui.
- `ocorrencias_ixc` e `sincronizacoes_ixc` seguem órfãs. Não dropar sem pedido.

## 11. Arquivos

**api-db-redfox-process**
- `prisma/migrations/20260910120000_pontuacao_ranking/migration.sql` — três booleanos de sinal
- `prisma/schema.prisma` — mesmos campos em `ConfiguracaoRanking`

**gerenciador-processos-backend**
- `repositories/repositorio.auditorias.ixc.ts` — contagem por chamado distinto
- `repositories/ranking.repository.ts` — leitura de `registros_ponto` agregada por usuário e
  período; gravação da pontuação
- `services/ranking.service.ts` — preencher `atrasoMinutos` e `faltas`, aplicar os sinais,
  carregar `usuarioId` no item
- `services/regras-ranking.service.ts` e controller — `acrescenta` no POST e PUT, `pontos`
  positivo

**gerenciamento-processos-redfox**
- Card de regras: botões Descontar e Acrescentar, editar e remover regra

## 12. Como verificar

`criarRankingService` recebe dependências injetadas, então o cenário fecha sem banco: 5 O.S a
1000 pontos, 10 minutos de atraso a 120 descontando, esperado 3800.

```bash
cd gerenciador-processos-backend
npm run typecheck
npm test

cd api-db-redfox-process
npx prisma validate
npx prisma migrate reset
```
