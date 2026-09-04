# Monitoramento da Equipe: o que ainda falta integrar

Atualizado em: 04/09/2026.

A tela `src/pages/auditorias/monitoramentoEquipe.vue` foi ligada à API em 04/09/2026. Numa primeira etapa consumia só `GET /integracoes/ixc/divergencias`, e todo o lado aprovado da conta era estimado por uma taxa fixa. **Essa estimativa foi eliminada:** a tela agora consome também `GET /integracoes/ixc/auditorias`, e todo número dela é real.

Para o contrato das rotas, veja [`02-api-implementada.md`](./02-api-implementada.md); para o histórico da integração e as armadilhas do IXC, [`05-handoff-integracao-monitoramento.md`](./05-handoff-integracao-monitoramento.md).

## O modelo de dados, que é a chave de tudo

O IXC encadeia três ordens de serviço:

```
O.S  ->  O.S de auditoria  ->  O.S de divergência
```

A auditoria analisa a O.S; quando acha problema, encaminha o caso para a etapa de divergência, que vira uma O.S própria, com assunto próprio. Por isso as duas rotas enxergam chamados quase disjuntos (6 em comum entre 1596 e 286, na janela de 27 a 29/08/2026) e nenhuma ocorrência em comum.

**O universo da tela é `/auditorias`**, que traz cada ocorrência de auditoria fechada no período — aprovada ou não. `/divergencias` é o passo seguinte do fluxo.

### O veredito está em `tarefa`, não em `diagnostico`

Este é o ponto que mais confunde. O `diagnostico` de uma linha de `/auditorias` descreve o **desfecho técnico da O.S auditada** (`EQUIPAMENTO PERDIDO`, `REFEITO FUSÃO`, `REPARO COM TROCA DE EQUIPAMENTO`), não o veredito da auditoria. Uma mesma linha pode ter `diagnostico = "EQUIPAMENTO PERDIDO"` e `mensagem = "AUDITORIA DE O.S CONCLUIDA COM SUCESSO"`.

O veredito principal está em `tarefa` — a coluna `id_proxima_tarefa`, a próxima etapa do workflow. Quando ela é a tarefa de divergência, a auditoria achou problema e encaminhou o caso.

`mensagem` não serve como eixo: é texto livre, com 353 valores distintos em 1618 linhas.

### A regra completa

`services.auditorias.ixc.ts` marca `COM_DIVERGENCIA` quando qualquer um destes é verdadeiro, comparando sem acento e em maiúsculas:

| Critério | Campo |
|---|---|
| a auditoria encaminhou para a etapa de divergência | `tarefa` contém `DIVERGENCIA DE O.S` |
| a linha já é uma O.S de divergência | `assunto` contém `DIVERGENCIA DE O.S` |
| a auditoria reprovou | `tarefa` ou `diagnostico` contém `REPROVAD` |

Nenhuma linha é descartada: a rota devolve tudo, classificado.

**Precisão medida** — janela de 20/08 a 03/09/2026, 7683 auditorias contra 1486 divergências de uma janela mais larga (18/08 a 10/09), para não perder O.S de divergência que fecham depois. O teste pergunta se existe O.S de divergência do mesmo cliente aberta até 10 dias depois da auditoria fechar:

| | |
|---|---:|
| divergentes confirmados | **90,5%** |
| mesma medida entre os aprovados (ruído de base) | 5,3% |
| separação | 17x |

Resultado da janela: 1204 divergentes, 6479 aprovadas, taxa de 84,3%.

O critério de `tarefa` isolado confirma em 96,3% — é o mais forte. O de `assunto` confirma menos, mas por um motivo conhecido: essas linhas *são* a O.S de divergência, e boa parte delas está ausente de `/divergencias` por causa do defeito da seção 4. O critério de reprovação confirma pouco (12,9%) porque uma auditoria reprovada **não gera** O.S de divergência — ela é reprovação de documento/selfie, outro fluxo. Ela conta como não-aprovada, que é o que importa para a taxa.

### As armadilhas do vocabulário

O IXC escreve a mesma ideia de várias formas, e três delas invertem o sentido. Casar solto por `DIVERG` classifica ao contrário:

| Texto | Onde | Linhas | Significa |
|---|---|---:|---|
| `SEM DIVERGENCIA \| SEM TROCA` | `tarefa` | 42 | **não** houve divergência |
| `NÃO HOUVE DIVERGENCIAS` | `tarefa` | 24 | **não** houve divergência |
| `SEM DIVERGÊNCIAS` | `diagnostico` | 1 | **não** houve divergência |

Por isso a comparação usa a frase inteira, `DIVERGENCIA DE O.S`, e ainda assim passa por um guarda de negação (`SEM DIVERG`, `NAO HOUVE DIVERG`) — três grafias distintas para negar são evidência de que vão aparecer outras.

Mais duas:

- **Acento inconsistente.** `4.1 - DIVERGÊNCIA DE O.S | ...` (440 linhas) e `DIVERGENCIA DE O.S` (sem acento) significam o mesmo. A comparação normaliza.
- **Reprovação nos dois gêneros.** `AUDITORIA DE DOCUMENTO E SELFIE - REPROVADA` (62) e `1 - REPROVADO - TAXA DE INSTALAÇÃO COM VALOR DIVERGENTE` (1). Casar `REPROVAD` cobre os dois, e `APROVADO`/`APROVADA` (1852 linhas) não contém essa sequência — mas é frágil o bastante para ter teste próprio.

## Pendências restantes

### 1. Faltando integração do cadastro de equipe (nível e status do auditor)

**Mock:** `perfilEquipeMock` e `NIVEL_INDEFINIDO` em `src/mocks/data/auditoriaMonitoramento.ts`. É o único mock que sobrou no arquivo.

Na tabela "Ranking de Auditores", dois campos não têm origem no IXC:

| Campo | Situação |
|---|---|
| `nivel` ("Nível III") | mock, por nome do auditor; sem correspondência mostra `—` |
| `status` (Excelente / Atenção / Crítico) | mock; sem correspondência é derivado da faixa de `percentualAprovacao`, que hoje é real |

A chave do lookup é o **nome do auditor** em maiúsculas e sem acento, e não o ID: os IDs do IXC não correspondem a nenhum cadastro local. Hoje há cinco nomes cadastrados; qualquer outro auditor aparece com `Nível —`.

**O que destrava:** um cadastro local de equipe de auditoria vinculando o auditor a um nível, e a regra de negócio que define as faixas de status. Isso é LOCAL, não IXC.

Como `percentualAprovacao` passou a ser real, o mock e o dado podem se contradizer na tela: `GUSTAVO HAINO` aparece com 100% de aprovação e status `Atenção`, que vem do mock. Ao criar o cadastro, vale decidir se o status continua manual ou passa a ser derivado da taxa real.

### 2. A severidade do "Top O.S" mede participação, não taxa

Não é mock — é uma regra que ficou estranha agora que a taxa é real. `severidadePorParticipacao` classifica pelo **peso do assunto no total de divergências do período**, não pelo percentual de divergência do assunto. O resultado é que `AUDITORIA REPARO RESIDENCIAL` (24% de divergência, mas 106 casos) aparece como `CRÍTICO`, enquanto `AUDITORIA REATIVAÇÃO RESIDENCIAL` (68% de divergência, 21 casos) aparece como `MÉDIO`.

As duas leituras são defensáveis — volume absoluto contra taxa — e a regra atual é a que já existia. Não foi alterada por não ter sido pedido. Se a leitura desejada for por taxa, é uma função só, em `src/utils/monitoramento.ts`.

### 3. Contagem dupla: nunca some `/auditorias` com `/divergencias`

Não é pendência, é uma armadilha que já foi tentada. As linhas de `/auditorias` marcadas `COM_DIVERGENCIA` pela **tarefa** não são divergências ausentes de `/divergencias` — são a ocorrência de auditoria que *encontrou* o problema. A O.S de divergência que ela gerou já está na outra rota, como outro chamado.

Medido na janela de 27 a 29/08/2026, para as 300 linhas desse grupo:

| | |
|---|---:|
| ocorrência já presente em `/divergencias` | 0 |
| chamado já presente em `/divergencias` | 0 |
| cliente já presente em `/divergencias` | 291 (97,0%) |
| mesma medida nas auditorias aprovadas (controle) | 78 (6,0%) |

97% contra 6% de linha de base. Concatenar os dois conjuntos levaria 341 divergências a 641 e contaria cada problema duas vezes.

O grupo pego pelo **assunto** é diferente: essas 11 linhas já *são* O.S de divergência, e 5 dos 11 chamados não aparecem em `/divergencias`. A causa está na seção 4.

### 4. Tela de Divergências Técnicas — corrigida em 04/09/2026

A tela `src/pages/auditorias/divergenciasTecnicas.vue` nunca teve mock: já consumia `/integracoes/ixc/divergencias` inteiramente. O que faltava eram três defeitos na consulta, todos corrigidos. Medição feita comparando a rota antes e depois, na janela de 18/08 a 10/09/2026.

**a) O filtro de técnico derrubava divergências legítimas. Corrigido: +12 ocorrências.**

O `WHERE` exigia que o funcionário **da ocorrência** tivesse prefixo de técnico de campo (`RES -`, `DSL -`, `COR -`, `INF -`, `TER -`). Quando a ocorrência era escrita pelo auditor, a linha sumia — mesmo com a O.S tendo um técnico de campo de verdade.

A investigação mediu três caminhos:

| | ocorrências |
|---|---:|
| como estava | 1488 |
| aceitar quando a ocorrência **ou o chamado** tem técnico de campo | **1500** |
| remover o filtro de técnico | 1549 |

A terceira foi descartada: das 61 linhas que ela acrescentaria, 49 não têm técnico de campo em lugar nenhum — o funcionário é o próprio auditor. Elas entrariam no ranking de "técnicos ofensores" da tela atribuindo divergência a PAMELA, DAVI e LUANA, que são auditoras.

A solução aplicada aceita a linha quando **a ocorrência ou o chamado** tem técnico de campo, e o `SELECT` usa `CASE WHEN` para expor o técnico do chamado só quando o da ocorrência não serve. Resultado medido: +12 ocorrências, **nenhuma removida**, **nenhuma linha existente teve o técnico alterado**, e todas as 12 novas têm técnico de campo real e diagnóstico legítimo (`FOTO FORA DO PADRÃO TIMEMARK`, `SEM FOTO DE EPI`, `DIVERGÊNCIA NAS FOTOS DO SERVIÇO REALIZADO`, `SEM INFORMAÇÕES DA CAIXA E DA PORTA`).

**b) O filtro de cliente de teste não filtrava nada. Corrigido: impacto zero.**

Era `razao NOT LIKE '%TESTE-REDFOX%' OR razao NOT LIKE '%CLIENTE REDFOX TESTE1%'` — com `OR`, sempre verdadeiro. Virou `AND`, como já estava em `/auditorias`. Não há nenhum cliente de teste nos dados do período, então nenhum número mudou. Era defeito latente, não erro visível.

**c) O campo "observação" estava sempre vazio. Corrigido: preenchido em 100% das linhas.**

A tela renderiza `ocorrencia.observacao` e mostrava "Sem observação" sempre, porque o `SELECT` não trazia o texto. A coluna `mensagem` estava disponível na tabela que já constava do `FROM` — a mesma que `/auditorias` expõe. Agora vem como `observacao`, e traz o motivo escrito pelo auditor (`FOTO FORA DO PADRÃO TIME MARK`, `FOTO DO EPI FORA DO PADRÃO - SEM FOTO DA ESCADA NO POSTE`). O frontend normaliza espaços e devolve `null` quando vem vazia.

### 5. KPI "Total de auditorias" mostrava a contagem de divergências — corrigido

Bug encontrado pelo usuário em 04/09/2026, olhando a tela. Dois KPIs estavam ligados ao **mesmo campo**:

```
Divergências        -> resumo.totalDivergencias
Total de auditorias -> resumo.totalDivergencias   (o mesmo)
```

Não era regra errada: era o mesmo dado exibido duas vezes com rótulos diferentes. No dia 04/09 a tela mostrava 5 nos dois, quando o número real de auditorias era 119.

Corrigido: a tela passa a chamar `/auditorias` em paralelo com `/divergencias`, `ResumoDivergencias` ganhou `totalAuditorias` e `taxaDivergencia`, e a nota do KPI virou a taxa — antes era `totalMotivos / totalDivergencias`, rotulada "motivos por auditoria", que com os dois campos iguais dava sempre perto de 1 e não informava nada. O `mediaMotivos` foi removido da tela.

Depois: `Divergências 5 · Total de auditorias 119 · 4,2% com divergência`.

### 6. Validação da regra em dado do mesmo dia

Vale registrar, porque é a evidência mais direta que temos. Em 04/09/2026:

| | clientes |
|---|---|
| auditorias marcadas `COM_DIVERGENCIA` | 322000, 321979, 321862, 268353, **321077**, 321970 |
| divergências que `/divergencias` devolve | 322000, 321979, 321862, 268353, 321970 |

Cinco de seis batem exatamente. A sexta (cliente 321077, auditoria às 08:27) é uma O.S de divergência que ainda não fechou — a rota só traz as fechadas. Não é dado faltando.

### 7. O heatmap de fadiga mede taxa, não volume — não é defeito

Levantado porque pareceu que o gráfico "só contava das 8 às 9". Não é o caso. O heatmap colore cada célula pela **taxa de divergência** e ignora células com menos de 5 auditorias (`VOLUME_MINIMO`), porque taxa com menos amostras não é confiável. Em 04/09, às 11h40:

| hora | auditorias | divergentes | taxa | faixa |
|---|---:|---:|---:|---|
| 08h | 89 | 6 | 6,7% | Até 8% |
| 09h | 21 | 0 | 0,0% | Até 8% |
| 10h | 8 | 0 | 0,0% | Até 8% |
| 11h | 1 | 0 | — | Volume insuficiente |

As 10h estão no gráfico, com a mesma cor das 8h porque 0% e 6,7% caem na mesma faixa. As 11h ficam cinza pelo mínimo de volume. O volume por hora aparece no gráfico de barras ao lado (89, 21, 8, 1).

**Ponto de atenção, não corrigido:** a primeira faixa vai de 0% a 8%, então uma hora com zero divergência fica indistinguível de uma com 7,9%. Numa janela de um dia o heatmap tem 4 células preenchidas de 168 e acaba parecendo chapado. O gráfico foi desenhado para semana ou mês. Se incomodar, separar o zero numa faixa própria é mudança pequena — mas é decisão de leitura, não defeito.

### 8. Desempenho: por que as consultas levam 20 a 30 segundos

Diagnosticado em 04/09/2026. **A causa é uma só, e não é o volume do período.**

O `EXPLAIN` das duas rotas mostra:

```
su_oss_chamado_mensagem | type ALL | key NENHUMA | linhas examinadas 3.491.544
su_oss_chamado          | type eq_ref | key PRIMARY | 1
```

O filtro de data está numa tabela **juntada** (`su_oss_chamado.data_fechamento`) e essa coluna **não tem índice** — a tabela tem 18 índices, todos de chave estrangeira. Sem ele, o MySQL parte de `su_oss_chamado_mensagem` (3,5 milhões de linhas, 1,1 GB), varre tudo e só depois descobre a data. Por isso o tempo é **constante** (~20 a 30 s) para um dia ou para um ano.

Onde o tempo vai, no ano: consulta e materialização 27.145 ms, `JSON.stringify` 180 ms. **Serialização é 0,7%.**

Criar o índice resolveria tudo, mas o banco é do IXC e o acesso é somente leitura — descartado pelo usuário.

#### Otimização identificada, ainda NÃO aplicada

`su_oss_chamado.ultima_atualizacao` **é indexada**, e um chamado fechado numa data foi atualizado naquele momento. Usá-la como pré-filtro deixa o MySQL partir do chamado:

```sql
AND c.ultima_atualizacao >= DATE_SUB(?, INTERVAL <margem> DAY)
```

Medido, com margem de 7 dias e contagem idêntica à consulta atual em todos os casos:

| período | `/auditorias` | `/divergencias` | hoje |
|---|---:|---:|---:|
| dia | 215 ms | 122 ms | ~20.000 ms |
| semana | 396 ms | 253 ms | ~22.000 ms |
| mês | 1.134 ms | 1.080 ms | ~23.000 ms |
| ano | 26.875 ms | 28.864 ms | ~28.000 ms |

O ano não melhora porque a janela mais a margem cobre quase toda a parte recente da tabela e o otimizador volta a varrer.

**A margem é uma heurística, não uma garantia.** O invariante `ultima_atualizacao >= data_fechamento` falha em 38.030 chamados de 2,3 milhões (1,6%): 28.198 com defasagem de até 7 dias, 1.173 entre 8 e 86 dias, e 8.659 com data inválida. **Todos, sem exceção, são de 2021 e 2022 — zero de 2023 em diante.** Uma margem de 7 dias perderia os 1.173, todos legados. Se o IXC mudar como preenche esse campo, o sintoma é linha faltando, em silêncio.

### 9. O que foi aplicado para desempenho

**a) Rota de contagem `/integracoes/ixc/auditorias/total`.** A tela de Divergências precisa do total de auditorias para o KPI, e usava a rota que traz as linhas — **79,7 MB trafegados para obter um número** no período de ano. A rota nova roda `COUNT(*)` sobre exatamente o mesmo `WHERE`; o total confere. Payload: 80 MB → 15 bytes.

**b) Cache em memória** (`src/database/cache.ixc.ts`), aplicado nas duas rotas e na contagem.

| | frio | com cache |
|---|---:|---:|
| `/auditorias/total` dia | 17,8 s | 0,015 s |
| `/divergencias` dia | 24,5 s | 0,004 s |

TTL de 5 minutos para janela que inclui hoje, 1 hora para janela fechada. Limite de **20.000 linhas por entrada** e 24 entradas, com descarte do mais antigo.

O limite existe por um motivo concreto: guardar o ano de auditorias (165 mil linhas, ~170 MB de heap) é o que **já derrubou o servidor** nesta sessão, por falta de memória. Esse caso fica deliberadamente fora do cache — medido, 27,0 s na primeira e 26,4 s na segunda, sem ganho e sem risco.

**c) `shallowRef` nas duas telas.** As listas cruas e o painel saíram de `ref` para `shallowRef`. Com a massa do ano no Monitoramento:

| | carga inicial | trocar auditor | memória |
|---|---:|---:|---:|
| `ref` | 3.077 ms | 1.524 ms | +522,7 MB |
| `shallowRef` | 1.474 ms | 1.147 ms | +221,8 MB |

`ref` torna o conteúdo reativo em profundidade: ao percorrer 165 mil linhas o Vue cria um Proxy para cada objeto. O código nunca altera linha individual, só substitui a lista inteira — então a reatividade profunda é custo puro.

**d) Timeout do axios** de 30 s para 180 s, mas **só nas rotas do IXC** (`TEMPO_LIMITE_IXC`). O global segue 30 s. `connectionLimit` do pool do IXC de 5 para 10.

**e) Pré-filtro por `ultima_atualizacao`, aplicado nas duas rotas.** `src/repositories/margem.ixc.ts` decide a margem: 7 dias para janelas a partir de 2023, 120 dias para janelas anteriores — as únicas violações do invariante são de 2021 e 2022.

Medido na API, depois de aplicado:

| | antes | depois |
|---|---:|---:|
| `/auditorias` dia | ~20 s | **0,22 s** |
| `/auditorias` semana | ~22 s | **0,55 s** |
| `/auditorias` mês | ~23 s | **1,52 s** |
| `/divergencias` dia | ~24 s | **0,18 s** |
| `/divergencias` semana | ~24 s | **0,27 s** |
| `/divergencias` mês | ~25 s | **1,11 s** |

Validado comparando o **conjunto de `ocorrenciaIxcId`** com e sem o pré-filtro nos seis casos: idênticos, zero linha faltando, zero a mais. O ano continua em ~27 s porque a janela mais a margem cobre quase toda a parte recente da tabela e o otimizador volta a varrer.

**f) Rota de resumo `/integracoes/ixc/auditorias/resumo`.** A janela anterior do Monitoramento alimenta só quatro números — total, aprovadas, intervalo médio entre baixas, e o mesmo par por auditor —, e para isso baixava 165 mil linhas.

A rota agrupa no SQL pelos campos que a regra de classificação usa (`id_operador`, `funcionario`, `tarefa`, `assunto`, `diagnostico`) e devolve `COUNT(*)` por grupo. **A regra continua só no service**, aplicada por grupo e somada pelo `COUNT` — nada de reescrever a classificação em SQL.

| período | linhas | grupos | payload |
|---|---:|---:|---:|
| mês | 15.732 | 529 | 8 MB → **1,3 KB** |
| ano | 165.197 | 1.792 | 80 MB → **346 KB** |

O intervalo médio entre baixas vem de `LAG()` particionado por auditor e dia (MariaDB 11.4), replicando a restrição de mesmo dia que o frontend usa. **Conferido contra a implementação em JS: 3,5 min nos dois caminhos.** Total, aprovadas e o detalhe por auditor também conferem linha a linha, e os sete indicadores do painel saem idênticos.

Com 1.792 grupos a janela anterior do ano passou a **caber no cache**, o que antes não acontecia.

#### O que continua em aberto

- **O "Ano" continua lento na primeira carga** (~27 s), nas duas telas. O pré-filtro não alcança esse caso e nenhuma otimização de consulta alcança: sem índice em `data_fechamento`, a varredura de 3,5 milhões de linhas é inevitável. O que mudou é que o **payload** deixou de ser o problema — 80 MB viraram 346 KB na janela anterior e 15 bytes na contagem —, então o servidor não morre mais por causa dele.
- **O cache tem teto de 60.000 linhas no total** (`MAXIMO_LINHAS_GUARDADAS`), além do teto de 20.000 por entrada. O teto global foi acrescentado depois de o servidor cair uma segunda vez por memória: só o limite por entrada permitia guardar 24 × 20.000 = 480 mil linhas.
- **Semântica dos períodos.** Hoje são janelas móveis (`ano` = últimos 365 dias, `mes` = últimos 30). Os rótulos "Mês" e "Ano" sugerem calendário. O usuário não pode renomear as opções — foi especificado assim —, então a decisão é entre manter a janela móvel ou trocar a semântica para calendário. Trocar reduz o ano em 20% hoje (131.443 contra 165.188 linhas) mas não resolve o tempo, e o ganho desaparece em dezembro. Mudar para calendário também exige rever a comparação com a janela anterior no Monitoramento: no dia 4 do mês, comparar 4 dias contra 31 daria variação sempre negativa.

### 10. Responsabilidade de cada rota, e o bug de nome que apareceu no caminho

Ajustado em 04/09/2026, a pedido do usuário: cada rota passa a carregar a própria responsabilidade.

**a) `/auditorias` filtra por padrão.** Sem parâmetro devolve apenas `APROVADA_SEM_DIVERGENCIA` — o contrato honesto para o nome da rota. Com `?incluirDivergentes=true` devolve as duas metades.

O parâmetro existe porque a tela de Monitoramento precisa das duas: os gráficos empilhados e os blocos por assunto tiram numerador e denominador da mesma linha. Se ela tivesse de buscar o lado divergente em `/divergencias`, **43% do volume divergente não casaria com nenhum assunto de auditoria** — é o problema da antiga seção 7.1 do handoff, que só está resolvido porque as duas metades vêm juntas.

**b) `/divergencias` ganhou `tipoDivergencia`.** A ideia original era expor `tarefa` (a próxima tarefa da ocorrência), mas ela vem **NULL em 100%** das 2.583 ocorrências de divergência do mês: a O.S de divergência é o fim do fluxo, não encaminha para lugar nenhum.

O campo útil é outro — `su_oss_chamado.id_wfl_tarefa`, a tarefa **atual do chamado**, que descreve o tipo:

| | |
|---|---:|
| `DIVERGENCIA DE O.S` | 47,8% |
| `4.1 - DIVERGÊNCIA DE O.S \| APROVADO - TAXA ISENTA CORRETAMENTE` | 38,5% |
| `DIVERGENCIA DE O.S \| NAO HOUVE TROCA DE EQUIPAMENTO` | 9,5% |
| variantes de troca de equipamento, `INFRAESTRUTURA`, `CORPORATIVA`, `TERCEIRO`, `REPROVADO` | resto |

É o **mesmo vocabulário** do `tarefa` de `/auditorias`: a próxima tarefa da auditoria vira a tarefa atual do chamado de divergência. Confirma o modelo do fluxo de forma direta.

**c) Bug encontrado no caminho: o nome do auditor estava errado em 13% das linhas.**

`/auditorias` trazia `auditorNome` de `funcionarios` via `id_tecnico`. Só que em parte das ocorrências o `id_tecnico` carrega o **técnico de campo** (`RES - ADEMIR ANDRADE`, `DSL - MICHAEL NOVAIS`), não o auditor. Medido no mês: o nome batia com `usuarios.nome` do `id_operador` em **17.365 de 19.944 linhas (87,1%)**.

Como o ranking do Monitoramento tomava o nome da primeira linha de cada auditor, um auditor podia aparecer com nome de técnico — ou de outro auditor. Foi assim que a rota de resumo exibiu o operador 507 como "GUSTAVO HAINO" quando 507 é LUANA ALVES.

Corrigido: o service resolve o nome contra `usuarios` pelo `id_operador`, exatamente como `/divergencias` já fazia. `buscarNomesOperadores` saiu de `repositorio.divergencias.ixc.ts` para `repositorios/operadores.ixc.ts` e agora serve aos dois. Depois da correção, **cada operador tem um único nome**, e apareceu um auditor que estava escondido atrás de nome errado: MATHEUS SANTOS OLIVEIRA (id 518), com 1.473 auditorias no mês.

### 11. Por que os totais das duas telas não batem — e não vão bater

Levantado pelo usuário em 04/09/2026, ao comparar "Com divergência" do Status Operacional com o KPI "Divergências" da outra tela. No mês: **2.414** contra **2.203**. Três causas somadas:

1. **Unidade de contagem.** O KPI de Divergências conta O.S de divergência distintas; "Motivos apontados" conta ocorrências (2.488). O Monitoramento conta ocorrências de auditoria.
2. **Eventos diferentes.** Monitoramento responde "das auditorias feitas, quantas acharam problema?"; Divergências responde "quantas O.S de divergência fecharam?".
3. **Defasagem de janela.** No mês, 147 auditorias marcadas (6,1%) tiveram a divergência fechando fora do período, e 10 chamados de divergência vieram de auditorias anteriores.

**A estrutura impede a igualdade.** Medindo por ticket — que é a chave que amarra as três etapas, e está preenchida em 100% dos chamados de auditoria — um ticket com divergência tem quase sempre **mais de uma ocorrência de auditoria**: 1.116 tickets com 2, 815 com 4, 149 com 6, 110 com 8 ou mais. Um ticket com 4 auditorias e 1 divergência vai sempre contar 4 de um lado e 1 do outro.

Validando a regra de classificação contra essa verdade estrutural (existe O.S de divergência no mesmo ticket?): **precisão 94,4%, acurácia 91,8%**. O recall aparente de 66,3% é artefato da atribuição por ticket — quando um ticket tem 4 auditorias e 1 divergência, só uma delas a gerou e as outras três são aprovações legítimas.

**Resolvido por explicação, não por número.** Os totais estão certos nas duas telas e não devem convergir. Em 04/09/2026 foi acrescentado um ícone de ajuda (`q-tooltip`, padrão já usado no projeto) em cada um dos dois cards:

- Monitoramento, "Status Operacional": *auditorias em que o auditor encontrou problema e encaminhou para divergência*;
- Divergências Técnicas, KPI "Divergências": *O.S de divergência fechadas, contadas uma vez cada*.

A nota abaixo do KPI de Divergências passou a acompanhar o período selecionado ("divergências fechadas hoje", "…na semana", "…no mês", "…no ano"). Os estilos `.rf-ajuda` e `.rf-ajuda__balao` foram para `src/css/app.scss`, usando os tokens existentes.

**Reconciliação exata, medida em 04/09/2026 via ticket:**

```
46  auditorias marcadas COM_DIVERGENCIA   (Monitoramento)
 -8  marcadas sem O.S de divergencia no ticket
 +3  O.S de divergencia orfas (auditoria de origem fora do dia)
----
41  O.S de divergencia                    (Divergencias Tecnicas)
```

Das 8 sem par, 2 eram `AUDITORIA DE DOCUMENTO E SELFIE - REPROVADA` — diferença **permanente**, porque esse fluxo nunca gera O.S de divergência — e 6 eram encaminhamentos cuja O.S ainda não fechara, diferença **temporária**. As 45 ocorrências para 41 O.S se explicam por 4 chamados com dois motivos cada.

### 12. Duas categorias que nunca aparecem — não confirmado

A tela deriva a categoria do prefixo do nome do técnico e declara cinco: `RES` Residencial, `DSL` Condomínio, `INF` Infraestrutura, `COR` Corporativo, `TER` Terceiro.

Na janela de 18/08 a 10/09/2026 aparecem **RES 1431, DSL 62, COR 5** — nenhuma linha com `INF` ou `TER`.

**Isso é uma observação, não um diagnóstico.** Não sabemos se esses tipos de técnico deixaram de existir, se mudaram de nomenclatura, se simplesmente não geraram divergência no período, ou se são sazonais. Uma janela de 24 dias não basta para concluir. Nada foi alterado por causa disso, e as duas categorias continuam declaradas. Antes de mexer, confirmar com quem conhece o cadastro de técnicos do IXC.

## O que é real nesta tela

Praticamente tudo. Registrado para evitar retrabalho:

- total de auditorias do período e sua variação contra a janela anterior;
- taxa de aprovação e sua variação, em pontos percentuais;
- a divisão aprovado/divergente do card "Status Operacional", que fecha por construção — numerador e denominador saem da mesma linha;
- as duas séries do gráfico "Volume de Auditorias", por hora;
- o heatmap "Curva de Fadiga", com as duas contagens reais por hora e dia da semana;
- "Performance por Assunto", "Detalhes por Categoria" e "Top O.S", agrupados pelo `assunto` da O.S de auditoria (`AUDITORIA REPARO RESIDENCIAL #` vira `AUDITORIA REPARO RESIDENCIAL`);
- o ranking de auditores: volume aprovado, taxa e variação em pontos percentuais;
- intervalo médio entre baixas (diferença entre `fechadoEm` consecutivos do mesmo auditor, restrita ao mesmo dia) e sua variação;
- lead time médio (`abertoEm` → `fechadoEm`, só horas úteis de segunda a sexta, 08h–18h);
- nomes e IDs dos auditores, incluindo as opções do filtro;
- os dois insights do relatório gerencial — "técnico campeão de erros" e "principal falha cadastral" — extraídos de `/divergencias`, a única rota que conhece o técnico da O.S de origem.

## Observações de contrato

1. **A junção entre as rotas é por `operadorIxcId`.** Em `/auditorias`, `auditorIxcId` vem de `funcionarios`; em `/divergencias`, de `usuarios`. São tabelas com espaços de ID independentes e os valores não se correspondem. `operadorIxcId` é a única chave comum. Nunca junte por nome.
2. **`data_fechamento` é do chamado, não da mensagem.** Ocorrências diferentes do mesmo chamado carregam o mesmo carimbo, o que infla o volume por hora e zera o intervalo entre baixas dessas linhas. Na janela medida: 22 chamados com mais de uma ocorrência em `/auditorias`, 55 em `/divergencias`.
3. **`LEFT JOIN` + `NULL LIKE` engole linhas.** Tanto `NULL LIKE '...'` quanto `NULL NOT LIKE '...'` resultam em `NULL`, que não passa no `WHERE`. Ocorrência sem diagnóstico desaparece das duas consultas. Vale para qualquer filtro novo: 814 das 1618 linhas de `/auditorias` têm `tarefa` nula, e um `NOT LIKE` seco sobre ela derrubaria metade da consulta em silêncio.
