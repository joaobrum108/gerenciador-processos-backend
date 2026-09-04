# Handoff: integração da tela de Monitoramento da Equipe

Escrito em: 04/09/2026. Destinado a quem for continuar este trabalho sem ter participado da sessão anterior.

Leia este documento **inteiro** antes de tocar em qualquer arquivo. Ele descreve decisões que já foram tomadas pelo usuário, um problema de dados ainda em aberto, e várias armadilhas do IXC que já custaram tempo.

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
2. **Etapa concluída no backend, NÃO ligada no frontend:** foi criada a rota `GET /integracoes/ixc/auditorias`, que devolve as auditorias fechadas (o lado aprovado da conta). **O frontend ainda não a consome.**

O próximo passo natural é juntar as duas rotas no frontend e eliminar as estimativas. **Não faça isso antes de ler a seção 7**, que descreve um problema de classificação ainda sem resposta do usuário.

## 3. Decisões do usuário — não reverta sem perguntar

Estas foram decisões explícitas, não suposições:

1. **Não alterar a consulta de `/divergencias`.** O usuário considerou remover o filtro `NOT LIKE '%AUDITORIA CONCLUIDA%'` e decidiu não mexer, porque a tela de Divergências Técnicas já consome essa rota em produção. A rota nova foi criada em paralelo justamente para não tocar nela.
2. **O lado aprovado é estimado por taxa fixa sobre o volume real de divergências.** Foram apresentadas três opções (manter as curvas mock antigas, zerar a série aprovada, ou estimar por taxa); o usuário escolheu a taxa. O motivo de não zerar: os gráficos são empilhados e o Status Operacional ficaria 100% divergente.
3. **Nível e status do auditor continuam mock.** Dependem de um cadastro de equipe que não existe. O usuário optou por manter mock nesses campos específicos em vez de removê-los da tela.
4. **O template e o SCSS da tela não devem mudar.** Só o `<script setup>` foi reescrito. A única alteração no HTML foi trocar dois textos fixos por dados reais (seção 5).

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

O service acrescenta `resultado: "APROVADA_SEM_DIVERGENCIA"` em cada linha. Esse campo existe para que o consumidor não precise deduzir a origem pela rota que chamou. **Veja a seção 7 antes de confiar nesse valor.**

Nenhuma das duas rotas exige autenticação hoje — `routesIxc.use(autenticar)` está comentado. Dá para bater direto no Postman.

## 5. Frontend: o que foi feito

| Arquivo | Situação |
|---|---|
| `src/utils/monitoramento.ts` | **novo.** Toda a agregação. Espelha `utils/divergencias.ts`, que é o padrão da casa: função pura que recebe as linhas cruas e devolve o painel pronto. |
| `src/services/monitoramentoService.ts` | **novo.** Chama `divergenciasService.listar` duas vezes em paralelo: janela atual e janela anterior de mesmo tamanho. |
| `src/mocks/data/auditoriaMonitoramento.ts` | **reduzido de 346 para ~100 linhas.** Sobrou só o que não tem fonte no IXC. |
| `src/pages/auditorias/monitoramentoEquipe.vue` | `<script setup>` reescrito. Template e SCSS preservados, exceto o bloco de insights do relatório gerencial, que tinha dois textos fixos no HTML e passou a usar dados reais. |
| `src/types/index.ts` | acrescentados `PainelMonitoramento`, `CategoriaMonitoramento`, `SeveridadeOs`, `OsMaisDivergente`, `OpcaoAuditor`, `InsightsMonitoramento`. Alguns já existiam soltos dentro da página. |

Arquitetura: a página guarda as duas janelas cruas em `ref`, e o painel é um `computed` sobre elas. Trocar o auditor no filtro **reagrega o que já está em memória**, sem nova ida à API. Só mudar o período dispara requisição.

### 5.1 O que já é dado real na tela

Volume de divergências e sua variação contra a janela anterior; intervalo médio entre baixas e sua variação; lead time; distribuição por hora e por dia da semana; agrupamento por assunto; nomes e IDs dos auditores e as opções do filtro; severidade do Top O.S; e os dois insights do relatório gerencial (técnico mais frequente e diagnóstico mais frequente).

### 5.2 O que ainda é estimado ou mock

Está detalhado em [`04-monitoramento-equipe-pendencias.md`](./04-monitoramento-equipe-pendencias.md), que continua válido. Em resumo: `TAXA_APROVACAO_ESTIMADA = 0.742` deriva todo o lado aprovado; `taxaDivergenciaEstimada(hora, diaSemana)` dá relevo ao heatmap; `perfilEquipeMock` cobre nível e status do auditor.

Regra prática: **todo número de divergência na tela é real; todo número de aprovação é estimado.**

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

## 7. PROBLEMA EM ABERTO — precisa de resposta do usuário

O usuário descreveu a consulta nova como "auditorias concluídas sem divergências". **Os dados não confirmam isso.** A consulta não filtra por diagnóstico de aprovação; ela apenas **exclui uma lista de 6 diagnósticos**. O que sobra são 25 diagnósticos distintos, e nem todos são aprovação:

```
 1071  AUDITORIA CONCLUIDA
  221  4 - APROVADO - TAXA DE INSTALAÇÃO ISENTA CORRETAMENTE
  127  FOTO SELFIE E DOCUMENTO CORRETOS
   49  REPARO COM TROCA DE EQUIPAMENTO
   26  FOTO FORA DO PADRÃO TIMEMARK          <-- divergência
   25  REFEITO FUSÃO
   20  RECONFIGURAÇÃO
   17  CLIENTE DESISTIU DO PROCEDIMENTO      <-- não é auditoria
   13  NÃO ANEXOU DOCUMENTO                  <-- divergência
    9  CABO SACADO
    8  RETORNO APÓS MASSIVA
    6  CLIENTE AUSENTE                       <-- não é auditoria
    6  READEQUAÇÃO DE CABO
    3  MANOBRA DE PAR  (PRIM/SEC)
    3  FOTO E DOCUMENTO NAO COMPATIVEIS      <-- divergência
    2  FOTO DO EPI FORA DO PADRÃO            <-- divergência
    2  RETIRADA DE EQUIPAMENTO CORPORATIVO CONCLUIDA
    2  VELOCIDADE CHEGANDO CONFORME CONTRATO
    2  DESISTIU DA ADESÃO                    <-- não é auditoria
    1  NÃO PRECISOU FAZER TROCA - EQUIPAMENTO COMPATIVEL
    1  ROMPIMENTO
    1  VALOR RECEBIDO/COBRADO PELO TÉCNICO   <-- divergência
    1  TERCEIRA VISITA SEM SUCESSO           <-- não é auditoria
    1  INVIABILIDADE - TUBULAÇÃO OBSTRUIDA   <-- não é auditoria
    1  SEM FOTO DE EPI                       <-- divergência
```

`SEM FOTO DE EPI` e `FOTO FORA DO PADRÃO TIMEMARK` são exatamente os diagnósticos que a tela de Divergências trata como divergência. Ou seja, **marcar todas as 1618 linhas como `APROVADA_SEM_DIVERGENCIA` está errado** — pelo menos 46 delas são divergências, e mais 27 não parecem ser auditorias.

As marcações acima são leitura do texto do diagnóstico, **não** regra de negócio confirmada. Um terceiro grupo é genuinamente ambíguo — `REPARO COM TROCA DE EQUIPAMENTO`, `REFEITO FUSÃO`, `RECONFIGURAÇÃO`, `CABO SACADO`, `RETORNO APÓS MASSIVA`, `READEQUAÇÃO DE CABO`, `MANOBRA DE PAR` — e parece descrever o desfecho técnico da O.S auditada, não o veredito da auditoria.

**O que fazer:** pergunte ao usuário como classificar os 25 diagnósticos em aprovada / divergente / fora do escopo. Sem isso, qualquer taxa de aprovação calculada estará errada. Não invente a classificação e não presuma que o `resultado` fixo no service está correto — ele foi escrito antes desta análise e é o principal candidato a mudar.

Quando a classificação existir, o lugar certo dela é o service (`services.auditorias.ixc.ts`), não o SQL e não o frontend, para que o campo `resultado` passe a refletir a regra.

### 7.1 Segundo problema em aberto: o eixo de assunto

Os dois lados usam vocabulários diferentes e **não casam por string**:

```
/auditorias   .assunto  →  "AUDITORIA REPARO RESIDENCIAL #", "MT - CONFERENCIA RETIRADA DE EQUIPAMENTO #"
/divergencias .tituloOs →  "01.1 - INSTALAÇÃO_RESIDENCIAL #", "SEM ACESSO *"
```

Em `/divergencias` o campo `assunto` é constante (`DIVERGENCIA DE O.S`, 341 de 341 linhas), porque é o próprio filtro do `WHERE`; por isso o frontend usa `tituloOs`, que é o título da O.S auditada. Em `/auditorias` o `assunto` é o assunto da O.S de auditoria — outro nível.

Os blocos "Performance por Assunto", "Detalhes por Categoria" e "Top O.S com maior % de divergências" dependem de um eixo único. Hoje eles usam `tituloOs` normalizado (o prefixo numérico e os marcadores `#`/`_` são removidos em `nomeAssunto`). Juntar as duas rotas exige decidir qual eixo vale — provavelmente `su_oss_chamado.id_assunto` do chamado auditado, que **nenhuma das duas consultas expõe hoje**.

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

## 10. Resumo do que fazer a seguir

1. Levar a seção 7 ao usuário e obter a classificação dos 25 diagnósticos. **Bloqueante.**
2. Resolver o eixo de assunto da seção 7.1.
3. Só então: aplicar a classificação no service, ligar `/auditorias` no `monitoramentoService`, juntar as duas janelas por `operadorIxcId` em `utils/monitoramento.ts`, e apagar `TAXA_APROVACAO_ESTIMADA`, `VARIACAO_APROVACAO_ESTIMADA` e `taxaDivergenciaEstimada` do arquivo de mock.
4. `perfilEquipeMock` (nível e status) continua mock mesmo depois disso — depende de um cadastro local de equipe que não existe.
5. Atualizar [`04-monitoramento-equipe-pendencias.md`](./04-monitoramento-equipe-pendencias.md) conforme os itens forem caindo.
