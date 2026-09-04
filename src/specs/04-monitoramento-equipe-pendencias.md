# Monitoramento da Equipe: o que ainda falta integrar

Atualizado em: 04/09/2026.

A tela `src/pages/auditorias/monitoramentoEquipe.vue` foi ligada à API em 04/09/2026, consumindo `GET /api/v1/integracoes/ixc/divergencias`. Nenhuma rota nova foi criada e a consulta SQL não foi alterada.

Este documento registra o que **ainda é mock** nessa tela e qual integração destrava cada item. Para o contrato da rota consumida hoje, veja [`02-api-implementada.md`](./02-api-implementada.md); para o planejamento das rotas de monitoramento, [`03-rotas-backend.md`](./03-rotas-backend.md).

## Causa raiz de quase tudo que falta

A consulta de `repositorio.divergencias.ixc.ts` termina com:

```sql
AND (su_oss_chamado_mensagem_su_diagnostico.descricao NOT LIKE '%AUDITORIA CONCLUIDA%')
```

Ou seja: **a resposta traz apenas ocorrências divergentes, nunca uma auditoria aprovada.** Como cada linha retornada é uma auditoria fechada, todo número de divergência da tela é real; todo número de aprovação é estimado no frontend.

Isso é exatamente o que [`03-rotas-backend.md`](./03-rotas-backend.md) já antecipava na seção "O que ela ainda não atende sozinha": falta uma fonte com o universo total de auditorias elegíveis e um campo normalizado `resultado = APROVADA_SEM_DIVERGENCIA | COM_DIVERGENCIA`.

## Pendências

### 1. Faltando integração da taxa de aprovação — hoje é uma constante

**Mock:** `TAXA_APROVACAO_ESTIMADA = 0.742` em `src/mocks/data/auditoriaMonitoramento.ts`.

Essa constante deriva o volume de aprovadas a partir do volume real de divergências, e alimenta:

| Bloco da tela | O que a constante preenche |
|---|---|
| KPI "Taxa de Aprovação" | o valor inteiro (74,2% fixo, não muda com o período) |
| KPI "Total de Auditorias" | a parcela aprovada da soma |
| Card "Status Operacional" | a linha "Aprovado sem divergência" e as duas porcentagens |
| Gráfico "Volume de Auditorias" | a série "Sem divergência" |
| Gráfico "Performance por Assunto" | a parcela `aprovadas` de cada assunto e de cada responsável |
| Diálogo "Detalhes por Categoria" | `aprovadasQtd` e `aprovadasPct` de cada card |
| Relatório de aprovações (PNG) | "Total avaliado", "O.S. aprovadas", "Taxa de acertos" e a tabela inteira |
| Relatório gerencial (PNG) | "Total O.S", "Aprovação", "Divergências", "taxa de erro" e as barras do Top O.S |
| Tabela "Ranking de Auditores" | coluna "Total O.S apr." |

**O que destrava:** a fonte com as auditorias aprovadas. Duas formas, em ordem de esforço:

1. Remover a cláusula `NOT LIKE '%AUDITORIA CONCLUIDA%'` da consulta existente e filtrar essas linhas no frontend (`src/utils/divergencias.ts`), para a tela de Divergências Técnicas não mudar de comportamento. É uma remoção, não uma adição, mas muda o payload de uma rota já consumida.
2. Expor a consulta-base completa com o campo `resultado`, mantendo `/divergencias` como visão filtrada dela — o desenho recomendado em `03-rotas-backend.md`.

Feito isso, some a constante e todos os blocos acima passam a ser reais de uma vez.

### 2. Faltando integração da variação da taxa de aprovação

**Mock:** `VARIACAO_APROVACAO_ESTIMADA = 0`.

O selo "vs. período anterior" do KPI de aprovação fica sempre em `0%` (neutro), porque uma constante não varia entre janelas.

As outras duas variações da tela — "Total de Auditorias" e "Intervalo Méd. entre Baixas" — **já são reais**: o frontend faz duas chamadas em paralelo à mesma rota, a janela escolhida e a janela imediatamente anterior de mesmo tamanho, e compara. Assim que o item 1 for resolvido, essa terceira variação passa a ser calculada pelo mesmo caminho, sem trabalho adicional.

### 3. Faltando integração da distribuição real da curva de fadiga

**Mock:** `taxaDivergenciaEstimada(hora, diaSemana)`.

O heatmap "Curva de Fadiga" colore cada célula pela razão `comDivergencia / totalAuditorias`. O **volume de divergências de cada célula é real** (vem do `fechadoEm` de cada ocorrência); o que é inventado é apenas o formato da curva de aprovação: a proporção piora ao longo do turno e é pior na segunda e no sábado.

Sem essa curva, com uma taxa única, todas as células ficariam na mesma faixa de cor e o gráfico perderia a função. A curva é normalizada para que sua média dentro do expediente (08h–18h) coincida com `TAXA_APROVACAO_ESTIMADA` — do contrário o heatmap implicaria um volume de aprovadas muito diferente do resto da tela.

**O que destrava:** o mesmo do item 1. Com as auditorias aprovadas na resposta, a razão de cada célula passa a ser contada, e a curva inteira pode ser apagada.

### 4. Faltando integração do cadastro de equipe (nível e status do auditor)

**Mock:** `perfilEquipeMock` e `NIVEL_INDEFINIDO` em `src/mocks/data/auditoriaMonitoramento.ts`.

Na tabela "Ranking de Auditores", três campos não têm origem no IXC:

| Campo | Situação |
|---|---|
| `nivel` ("Nível III") | mock, por nome do auditor; sem correspondência mostra `—` |
| `status` (Excelente / Atenção / Crítico) | mock; sem correspondência é derivado da faixa de `percentualAprovacao` |
| `percentualAprovacao` por auditor | mock; sem correspondência cai na constante do item 1 |

A chave do lookup é o **nome do auditor** em maiúsculas e sem acento, e não o ID: os IDs de operador do IXC (ex.: `924`) não correspondem a nenhum cadastro local. Hoje há cinco nomes cadastrados; qualquer outro auditor que apareça na resposta é exibido com `Nível —`.

**O que destrava:** um cadastro local de equipe de auditoria vinculando `auditorIxcId` a nível, e a regra de negócio que define as faixas de status. Isso é LOCAL, não IXC — não depende do item 1.

São reais nessa mesma tabela: o nome e o ID do auditor, a ordenação e a coluna "Tempo méd. entre apr.".

## O que já é real nesta tela

Registrado para evitar retrabalho:

- volume de divergências e sua variação contra a janela anterior;
- intervalo médio entre baixas (diferença entre `fechadoEm` consecutivos do mesmo auditor, restrita ao mesmo dia) e sua variação;
- lead time médio (`abertoEm` → `fechadoEm`, contando só horas úteis de segunda a sexta, 08h–18h);
- distribuição por hora do dia e por dia da semana;
- agrupamento por assunto, a partir de `tituloOs` normalizado (`01.1 - INSTALAÇÃO_RESIDENCIAL #` vira `INSTALAÇÃO RESIDENCIAL`);
- nomes e IDs dos auditores, incluindo as opções do filtro;
- severidade do "Top O.S com maior % de divergências", derivada da participação real do assunto no total de divergências do período;
- os dois insights do relatório gerencial — "técnico campeão de erros" e "principal falha cadastral" — extraídos do técnico e do diagnóstico mais frequentes.

## Observações de contrato

Dois pontos que valem confirmar antes de evoluir a rota:

1. **`tituloOs` é o único eixo de assunto disponível.** O campo `assunto` é constante (`DIVERGENCIA DE O.S`), porque é o filtro do `WHERE`. Se existirem outros assuntos de auditoria em `su_oss_assunto` que devam entrar no universo, o agrupamento por assunto da tela muda de significado.
2. **`data_fechamento` é usada como o instante da baixa do auditor.** O cálculo de intervalo entre baixas assume que esse carimbo corresponde ao evento lançado por `id_operador`. `03-rotas-backend.md` já listava essa confirmação como pendente.
