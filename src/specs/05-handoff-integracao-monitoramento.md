# Handoff: integração da tela de Monitoramento da Equipe

Escrito em: 04/09/2026. Atualizado em 04/09/2026, ao fim da integração.

**A integração foi concluída.** Este documento continua valendo como registro das decisões e das armadilhas do IXC, mas as duas pendências que ele descrevia como bloqueantes (seções 7 e 7.1) estão resolvidas — leia-as pelo que aprendemos, não como trabalho a fazer. O estado atual da tela está em [`04-monitoramento-equipe-pendencias.md`](./04-monitoramento-equipe-pendencias.md).

Leia este documento **inteiro** antes de tocar em qualquer arquivo. Ele descreve decisões que já foram tomadas pelo usuário e várias armadilhas do IXC que já custaram tempo.

## 1. Onde fica o quê

Três pastas, irmãs, em `C:\Users\joao.pedro.RED\Desktop\trabalho\`:

| Pasta | O que é |
|---|---|
| `gerenciador-processos-backend` | API Node/Express + TypeScript. Fala com Postgres (local) e MySQL (IXC, somente leitura). |
| `gerenciamento-processos-redfox` | Frontend Quasar/Vue 3 + TypeScript. |
| `api-db-redfox-process` | Não foi tocada nesta sessão. |

A API sobe em `http://localhost:3200/api/v1`. As rotas do IXC ficam sob `/integracoes/ixc`.

## 2. O que estava sendo feito

A tela `src/pages/auditorias/monitoramentoEquipe.vue` (frontend) era **100% mock**: um arquivo de dados fixos multiplicado por um fator por período. O objetivo é alimentá-la com dados reais do IXC.

O trabalho foi feito em duas etapas, nesta ordem:

1. **Etapa concluída:** a tela foi ligada à rota que já existia, `GET /integracoes/ixc/divergencias`, aproveitando o padrão da tela de Divergências Técnicas. Tudo que dá para calcular só com divergências virou real; o resto ficou estimado.
2. **Etapa concluída:** foi criada a rota `GET /integracoes/ixc/auditorias`, que devolve as auditorias fechadas.
3. **Etapa concluída:** as duas rotas foram juntadas no frontend e as estimativas foram eliminadas. A classificação da seção 7 foi resolvida — o veredito não estava no diagnóstico, e sim na próxima tarefa do workflow.

## 3. Decisões do usuário — não reverta sem perguntar

Estas foram decisões explícitas, não suposições:

1. **Não alterar a consulta de `/divergencias`.** O usuário considerou remover o filtro `NOT LIKE '%AUDITORIA CONCLUIDA%'` e decidiu não mexer, porque a tela de Divergências Técnicas já consome essa rota em produção. A rota nova foi criada em paralelo justamente para não tocar nela.
2. ~~O lado aprovado é estimado por taxa fixa.~~ **Superada:** era provisória enquanto não havia fonte para o lado aprovado. Com `/auditorias` classificada, o dado é real e a estimativa foi removida. No lugar dela vale a decisão seguinte.
3. **A regra de classificação rotula, não descarta.** O usuário considerou filtrar as auditorias divergentes no próprio SQL e decidiu contra: a consulta não pode ser desestruturada. O service marca `resultado` e devolve tudo; quem consome filtra.
4. **Nível e status do auditor continuam mock.** Dependem de um cadastro de equipe que não existe. O usuário optou por manter mock nesses campos específicos em vez de removê-los da tela.
5. **O template e o SCSS da tela não devem mudar.** Só o `<script setup>` foi reescrito. A única alteração no HTML foi trocar dois textos fixos por dados reais (seção 5).

## 4. Backend: o que existe hoje

### 4.1 Rota antiga, intocada — `/divergencias`

```
GET /api/v1/integracoes/ixc/divergencias?dataInicio=AAAA-MM-DD&dataFim=AAAA-MM-DD
→ { "dados": DivergenciaIxc[] }
```

Arquivos: `repositories/repositorio.divergencias.ixc.ts`, `services/services.divergencias.ixc.ts`, `controllers/controllerDivergencias.ixc.ts`.

Filtros da consulta: `status = 'F'`, assunto do chamado `LIKE '%DIVERGENCIA DE O.S%'`, `data_fechamento BETWEEN ? AND ?`, técnico `LIKE 'RES/DSL/COR/INF/TER -%'`, e diagnóstico `NOT LIKE '%AUDITORIA CONCLUIDA%'`.

O `auditorNome` não vem do SQL: o service resolve os `id_operador` em lote contra a tabela `usuarios`, via `buscarNomesOperadores`. Nada disso foi alterado.

### 4.2 Rota nova, criada nesta sessão — `/auditorias`

```
GET /api/v1/integracoes/ixc/auditorias?dataInicio=AAAA-MM-DD&dataFim=AAAA-MM-DD
→ { "dados": Auditoria[] }
```

Arquivos criados: `repositories/repositorio.auditorias.ixc.ts`, `services/services.auditorias.ixc.ts`, `controllers/controllerAuditorias.ixc.ts`, `tests/auditorias.service.test.ts`. Uma linha adicionada em `routes/rotas.ixc.ts`.

**O SQL foi escrito pelo usuário**, não por Claude. Ele o deixou no arquivo sem extensão `src/repositories/repositorio.auditorias.ixc`, que continua lá para comparação e pode ser apagado. As únicas alterações feitas sobre o SQL original foram:

- as datas, que estavam fixas no texto, viraram `?` e recebem `${dataInicio} 00:00:00` / `${dataFim} 23:59:59`;
- os aliases das colunas viraram camelCase, para bater com o padrão do outro repositório;
- três colunas foram acrescentadas, todas de tabelas que já estavam no `JOIN`, sem tocar em nenhum filtro: `su_oss_chamado_mensagem.id` (`ocorrenciaIxcId`), `id_tecnico` (`auditorIxcId`) e `id_operador` (`operadorIxcId`).

Filtros da consulta: `data_fechamento BETWEEN ? AND ?`, **setor** do chamado `LIKE '%AUDITORIA%'`, funcionário em uma **lista nominal de 16 auditores**, cliente diferente dos dois clientes de teste, `status <> 'A'`, e diagnóstico fora de uma lista de 6 exclusões.

O service classifica cada linha em `resultado`, a partir de `tarefa`. **A consulta não foi alterada e nenhuma linha é descartada** — a rota devolve tanto as aprovadas quanto as que geraram divergência, e quem consome decide o que fazer com cada valor. Foi decisão explícita do usuário: rotular sem descartar mantém o dado cru disponível e permite corrigir a regra sem refazer consulta.

Nenhuma das duas rotas exige autenticação hoje — `routesIxc.use(autenticar)` está comentado. Dá para bater direto no Postman.

## 5. Frontend: o que foi feito

| Arquivo | Situação |
|---|---|
| `src/utils/monitoramento.ts` | **novo.** Toda a agregação. Espelha `utils/divergencias.ts`, que é o padrão da casa: função pura que recebe as linhas cruas e devolve o painel pronto. |
| `src/services/monitoramentoService.ts` | **novo.** Três chamadas em paralelo: `/auditorias` na janela atual e na anterior, e `/divergencias` na atual. A rota de divergências não precisa da janela anterior porque só alimenta os insights. |
| `src/services/auditoriasService.ts` | **novo.** Espelha `divergenciasService`. |
| `src/mocks/data/auditoriaMonitoramento.ts` | **reduzido de 346 para ~30 linhas.** Sobrou só `perfilEquipeMock` e `NIVEL_INDEFINIDO`. |
| `src/pages/auditorias/monitoramentoEquipe.vue` | `<script setup>` reescrito. Template e SCSS preservados, exceto o bloco de insights do relatório gerencial, que tinha dois textos fixos no HTML e passou a usar dados reais. |
| `src/types/index.ts` | acrescentados `PainelMonitoramento`, `CategoriaMonitoramento`, `SeveridadeOs`, `OsMaisDivergente`, `OpcaoAuditor`, `InsightsMonitoramento`, e depois `AuditoriaApi`, `ResultadoAuditoriaApi` e `RespostaAuditorias`. |

Arquitetura: a página guarda as linhas cruas em `ref`, e o painel é um `computed` sobre elas. Trocar o auditor no filtro **reagrega o que já está em memória**, sem nova ida à API. Só mudar o período dispara requisição.

### 5.1 O que é dado real na tela

Praticamente tudo — a lista completa está na seção "O que é real nesta tela" do documento 04.

### 5.2 O que ainda é mock

Só `perfilEquipeMock`: nível e status do auditor, que dependem de um cadastro local de equipe que não existe.

Regra prática antiga — *todo número de aprovação é estimado* — **não vale mais**. Aprovadas e divergentes saem da mesma linha de `/auditorias`, então os percentuais da tela fecham por construção.

## 6. Evidência medida — janela 27 a 29/08/2026

Números levantados batendo nas duas rotas reais, não estimados:

```
/auditorias   → 1618 linhas
/divergencias →  341 linhas
```

**Interseção de `ocorrenciaIxcId` entre as duas rotas: 0.** Os conjuntos são disjuntos; dá para concatenar sem risco de contar a mesma ocorrência duas vezes.

`ocorrenciaIxcId` é único dentro de cada rota. Já `chamadoIxcId` repete: 1618 ocorrências em 1596 chamados, e 341 em 286 chamados. Se em algum momento a contagem passar a ser "por O.S" em vez de "por ocorrência", isso precisa de `distinct`.

### 6.1 A chave de junção entre as rotas está confirmada

Este é o ponto que mais confunde e já foi resolvido empiricamente.

Em `/divergencias`, quem audita vem de `id_operador` (tabela `usuarios`) e é exposto como `auditorIxcId`.
Em `/auditorias`, quem audita vem de `id_tecnico` (tabela `funcionarios`) e é exposto como `auditorIxcId` — **um ID de outra tabela, que não corresponde ao anterior.**

Por isso `/auditorias` também devolve `operadorIxcId`. **É esse o campo que casa com o `auditorIxcId` de `/divergencias`**, confirmado pelos dados:

| operadorIxcId | Auditor | Aprovadas | Divergências |
|---:|---|---:|---:|
| 430 | PAMELA EVELYN DA SILVA | 405 | 121 |
| 507 | LUANA ALVES DE OLIVEIRA | 321 | 47 |
| 693 | DANIEL VELUCCI DE ALMEIDA | 296 | 75 |
| 861 | LUCAS BORGES VETZCOSKI | 171 | 0 |
| 924 | DAVI RODRIGUES DE CARVALHO | 149 | 74 |
| 862 | GUSTAVO HAINO | 143 | 0 |
| 631 | RHIKELLMY ISRAEL MORAES | 69 | 20 |
| 826 | VICTOR HUGO ALMEIDA COSTA | 35 | 0 |
| 502 | GABRIEL SANTOS DE OLIVEIRA | 18 | 4 |
| 664 | GUILHERME ANDRADE DOS SANTOS | 11 | 0 |

Os mesmos IDs, com os mesmos nomes, aparecem nos dois lados. **Junte por `operadorIxcId`, nunca por `auditorIxcId`, e nunca por nome.**

Se essa tabela for tomada ao pé da letra, a taxa de aprovação global do período seria 1618 / 1959 = **82,6%**, contra os 74,2% assumidos hoje. Mas leia a seção 7 antes de usar esse número.

## 7. RESOLVIDO — a classificação das auditorias

Ficava aqui um problema em aberto: o service marcava toda linha como `APROVADA_SEM_DIVERGENCIA`, e a análise dos 25 diagnósticos distintos mostrava que isso não podia estar certo — `FOTO FORA DO PADRÃO TIMEMARK` e `SEM FOTO DE EPI` são exatamente o que a tela de Divergências trata como divergência.

**A pergunta estava errada.** O usuário explicou o fluxo real: `O.S -> O.S de auditoria -> O.S de divergência`. A auditoria analisa a O.S e, quando acha problema, encaminha o caso para a etapa de divergência, que vira uma O.S própria.

Com isso, o veredito não está no `diagnostico` — que descreve o desfecho técnico da O.S auditada — e sim em `tarefa`, a coluna `id_proxima_tarefa`. Uma mesma linha pode ter `diagnostico = "EQUIPAMENTO PERDIDO"` e `mensagem = "AUDITORIA DE O.S CONCLUIDA COM SUCESSO"`; foi um exemplo assim, trazido pelo usuário, que destravou a análise.

A regra e as evidências que a sustentam estão em [`04-monitoramento-equipe-pendencias.md`](./04-monitoramento-equipe-pendencias.md). Duas armadilhas dela merecem destaque, porque custariam tempo de novo:

- **`SEM DIVERGENCIA | SEM TROCA`** (18 linhas) contém a palavra e significa o contrário. Casar por `DIVERG` classifica essas linhas ao inverso.
- **814 das 1618 linhas têm `tarefa` nula.** Se algum dia esse filtro for para o SQL, ele precisa de um `IS NULL OR ...` explícito — a armadilha 4 da seção 8 derrubaria metade da consulta em silêncio.

A regra final usa quatro critérios — `tarefa` de divergência, `tarefa` de reprovação, `assunto` que já é de divergência, e `diagnostico` que fala em divergência —, chegando a 325 divergentes e 1293 aprovadas, 79,9% de taxa. Sobra 1 linha mal classificada em 1618, documentada no 04.

### 7.1 RESOLVIDO — o eixo de assunto

Ficava aqui o problema de que `/auditorias.assunto` e `/divergencias.tituloOs` usam vocabulários diferentes e não casam por string, e a conclusão provisória era que faria falta expor `su_oss_chamado.id_assunto` nas duas consultas.

**Não foi preciso.** Com `/auditorias` como universo e o `resultado` marcado dentro dela, os blocos "Performance por Assunto", "Detalhes por Categoria" e "Top O.S" tiram numerador e denominador da mesma rota e do mesmo campo. Os percentuais fecham por construção, sem casar string entre rotas e sem tocar em nenhuma consulta.

`/divergencias` continua sendo consumida, mas só pelo detalhe que a outra rota não tem: `tecnicoNome` e o diagnóstico da falha, que alimentam os dois insights do relatório gerencial.

## 8. Armadilhas do IXC já descobertas

1. **Datas vêm como `dd/MM/yyyy HH:mm:ss`.** `new Date()` não interpreta esse formato e devolve `Invalid Date`. Use `paraDataHoraIso` de `utils/divergencias.ts`.
2. **`abertoEm` e `fechadoEm` são do chamado, não da mensagem.** Vêm de `su_oss_chamado.data_abertura` / `data_fechamento`. Várias mensagens do mesmo chamado carregam as mesmas datas — o que infla o volume por hora e zera o intervalo entre baixas dessas linhas. Já foi observado: 22 chamados com mais de uma ocorrência em `/auditorias`, 55 em `/divergencias`.
3. **O filtro de cliente de teste em `/divergencias` não filtra nada.** Está escrito `razao NOT LIKE '%TESTE-REDFOX%' OR razao NOT LIKE '%CLIENTE REDFOX TESTE1%'`; com `OR` a expressão é sempre verdadeira. Deveria ser `AND`, como está corretamente na consulta de `/auditorias`. Não foi corrigido porque mexeria numa rota em produção. **Reporte ao usuário antes de corrigir.**
4. **`LEFT JOIN` + `NULL LIKE` engole linhas.** Em SQL, tanto `NULL LIKE '...'` quanto `NULL NOT LIKE '...'` resultam em `NULL`, que não passa no `WHERE`. Ocorrência sem diagnóstico desaparece das duas consultas.
5. **`funcionarios` e `usuarios` são tabelas distintas** com espaços de ID independentes. Ver seção 6.1.

## 9. Como verificar o que você mudar

**Backend:**
```bash
cd gerenciador-processos-backend
npm run typecheck
npm test            # 80 testes hoje, 0 falhas
npm run dev         # sobe em :3200 com tsx watch
```

**Frontend:**
```bash
cd gerenciamento-processos-redfox
npm run typecheck   # vue-tsc
npx oxlint --config oxlint.config.ts <arquivos>
npm run build
```

O frontend não tem suíte de testes. A agregação de `utils/monitoramento.ts` foi verificada com um script descartável rodado via `tsx`, com dados sintéticos conferidos na mão: intervalo entre baixas, lead time atravessando a noite e o fim de semana, buckets de hora e dia da semana, soma dos responsáveis batendo com o total do assunto, e o filtro de auditor não encolhendo a lista de opções. Se mexer nessa lógica, vale refazer esse tipo de conferência — as funções são puras e fáceis de exercitar isoladamente.

Para bater nas rotas reais, o `.env` do backend já tem as credenciais do IXC (`DB_HOST_IXC` e afins). São consultas somente leitura.

## 10. O que foi feito e o que sobrou

Concluído em 04/09/2026:

1. A classificação da seção 7, aplicada em `services.auditorias.ixc.ts` — sem alterar a consulta e sem descartar linha.
2. O eixo de assunto da seção 7.1, resolvido sem tocar em SQL.
3. `/auditorias` ligada no frontend: `monitoramentoService` faz três chamadas em paralelo (auditorias da janela atual, da anterior, e divergências da atual — a rota de divergências não precisa da janela anterior, já que só alimenta os insights).
4. `TAXA_APROVACAO_ESTIMADA`, `VARIACAO_APROVACAO_ESTIMADA` e `taxaDivergenciaEstimada` apagadas do arquivo de mock.

Ainda em 04/09/2026, numa segunda rodada:

5. O critério de `assunto` foi acrescentado, corrigindo 11 linhas que eram O.S de divergência vazando para a consulta de auditoria e contavam como aprovadas.
6. As 14 auditorias reprovadas (`AUDITORIA DE DOCUMENTO E SELFIE - REPROVADA`) passaram a contar como não-aprovadas.
7. Foi descartada a ideia de concatenar as linhas divergentes de `/auditorias` em `/divergencias`: elas não faltam lá — são a ocorrência de auditoria que gerou a divergência, e somar contaria o mesmo problema duas vezes. A medição está na seção 3 do documento 04.
8. Todos os comentários foram removidos do código desta integração. É regra do usuário: nada de comentário em código; o contexto explicativo vive nestes specs.

O que sobrou está na seção "Pendências restantes" do documento 04. O item que segue mock é `perfilEquipeMock` (nível e status do auditor), que depende de um cadastro local de equipe que não existe — como já previsto na decisão 4 da seção 3 deste documento.

Numa terceira rodada, ainda em 04/09/2026:

9. A regra foi medida contra 7683 auditorias e 1486 divergências (janelas de 15 e 24 dias), não mais contra 3 dias. A medição achou dois defeitos na própria regra, ambos corrigidos: `NÃO HOUVE DIVERGENCIAS` era classificado ao contrário, e a reprovação no masculino (`REPROVADO`) escapava. Precisão final de 90,5% contra 5,3% de ruído de base.
10. A tela de Divergências Técnicas foi levantada. Ela não tem mock nenhum; o que falta são quatro coisas na consulta, medidas e listadas na seção 4 do documento 04.

Numa quarta rodada, ainda em 04/09/2026, a consulta de `/divergencias` **foi alterada** — a decisão 1 da seção 3 deixou de valer, por pedido do usuário, para corrigir a tela de Divergências Técnicas:

11. O filtro de técnico passou a aceitar a linha quando a ocorrência **ou o chamado** tem técnico de campo. +12 ocorrências, nenhuma removida, nenhum técnico de linha existente alterado.
12. O `OR` do filtro de cliente de teste virou `AND`. Impacto zero nos dados do período; era defeito latente.
13. A coluna `mensagem` passou a ser exposta como `observacao`, preenchendo um campo da tela que estava vazio em 100% dos casos.
14. O timeout do axios para as rotas do IXC subiu de 30s para 180s, e o `connectionLimit` do pool do IXC de 5 para 10. As consultas levam 20 a 25 segundos e a tela de monitoramento dispara três em paralelo — no limite antigo, período longo era abortado pelo cliente antes de responder.

As medições estão na seção 4 do documento 04. A seção 5 registra uma observação **não confirmada** sobre duas categorias de técnico que não aparecem no período — deliberadamente não tratada como diagnóstico.

Numa quinta rodada, ainda em 04/09/2026, o foco virou desempenho. As consultas levavam 20 a 30 segundos **em qualquer período**, porque o filtro de data está numa tabela juntada sem índice e o MySQL varria 3,5 milhões de linhas sempre. Criar o índice foi descartado pelo usuário — o banco é do IXC e o acesso é somente leitura.

15. **Pré-filtro por `ultima_atualizacao`**, que é indexada. Dia, semana e mês caíram de ~20–24 s para 0,18–1,52 s nas duas rotas. Validado comparando o conjunto de `ocorrenciaIxcId` com e sem o filtro: idênticos, zero linha perdida.
16. **Rota `/auditorias/total`**, porque a tela de Divergências trafegava 79,7 MB para obter um único número.
17. **Rota `/auditorias/resumo`**, que agrega no SQL e devolve a janela anterior do Monitoramento em 346 KB no lugar de 80 MB. A regra de classificação continua só no service.
18. **Cache em memória** com TTL por tipo de janela e teto global de 60.000 linhas.
19. **`shallowRef`** nas duas telas, cortando pela metade o tempo e a memória da agregação.

Detalhes e medições nas seções 8 e 9 do documento 04.

**Aviso ao próximo:** o servidor de desenvolvimento caiu duas vezes por falta de memória nesta sessão, sempre ligado ao período "Ano". A segunda vez expôs um defeito no cache escrito nesta mesma sessão — o teto era por entrada, não global, permitindo guardar 480 mil linhas. Corrigido, mas trate o "Ano" com cuidado: é o único caso que ainda materializa 165 mil linhas.
