# Rotas planejadas do backend por módulo e tela

> Este documento é o planejamento do contrato completo e não representa, sozinho, o que já está disponível. Para integração atual, comece em [`00-LEIA-ME-FRONTEND.md`](./00-LEIA-ME-FRONTEND.md) e consulte [`02-api-implementada.md`](./02-api-implementada.md).

## Objetivo

Este documento especifica as chamadas necessárias para atender todas as telas existentes no frontend. As rotas propostas usam o prefixo `/api/v1` e respeitam a separação definida entre banco local e IXC.

Legenda de origem:

- **LOCAL:** lê ou grava o banco do Gerenciador de Processos.
- **IXC:** consulta somente leitura ao IXC através do backend.
- **HÍBRIDA:** combina fatos IXC com configurações ou registros locais.
- **SEM API:** operação executada inteiramente no navegador.

## Padrões gerais da API

### Autenticação

Rotas privadas exigem `Authorization: Bearer <token>`. Somente login, renovação de sessão e rotas que recebem token público de assinatura ficam abertas.

### Paginação

Listagens usam:

```text
pagina=1
porPagina=25
ordenarPor=criadoEm
ordem=desc
```

Resposta padrão:

```json
{
  "dados": [],
  "pagina": 1,
  "porPagina": 25,
  "total": 0,
  "totalPaginas": 0
}
```

### Filtros

Datas são enviadas em ISO: `dataInicio=2026-09-01&dataFim=2026-09-30`. Data final é inclusiva. Horários retornam com timezone. Busca textual usa o parâmetro `busca`.

### Erros

```json
{
  "mensagem": "Descrição legível do erro",
  "codigo": "CODIGO_ESTAVEL",
  "campos": { "campo": ["Motivo do erro"] }
}
```

Status esperados: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429` e `500/503`.

### Concorrência e auditoria

Recursos mutáveis retornam `versao` ou `atualizadoEm`. Alterações recebem esse valor anterior e respondem `409` se outro usuário tiver modificado o registro. Toda baixa, abono, justificativa, cancelamento, arquivamento ou exclusão lógica deve registrar auditoria no backend.

## Módulo: Autenticação

### Tela: Login

| Método e rota | Origem | Finalidade |
|---|---|---|
| `POST /api/v1/auth/login` | LOCAL | autenticar por `email` e `senha`; retornar access token, refresh token, usuário e permissões |
| `POST /api/v1/auth/refresh` | LOCAL | renovar access token com refresh token válido |
| `POST /api/v1/auth/logout` | LOCAL | revogar a sessão/refresh token atual |
| `GET /api/v1/auth/me` | LOCAL | restaurar sessão; retornar usuário, vínculo IXC, grupos e permissões efetivas |

`POST /auth/login` recebe `{ email, senha }`. Senha nunca aparece na resposta ou em log.

## Módulo: Início

### Tela: Página inicial

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/inicio/resumo` | HÍBRIDA | cartões e atalhos do usuário, limitados às permissões dele |

Resposta recomendada: pendências de assinatura, agendamentos do dia, checklists pendentes e alertas de integração. Se a tela continuar apenas institucional, esta chamada pode ser omitida.

## Módulo: Auditorias

### Tela: Monitoramento da equipe

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/relatorios/auditorias/monitoramento` | IXC | KPIs, status operacional, volume por hora, performance por assunto e curva de atividade |
| `GET /api/v1/relatorios/auditorias/auditores` | IXC | opções de auditor para filtro, com `idIxc`, nome e ativo |
| `GET /api/v1/relatorios/auditorias/monitoramento/ranking` | IXC | tabela detalhada de desempenho dos auditores |
| `GET /api/v1/relatorios/auditorias/monitoramento/os-divergentes` | IXC | OS com maior quantidade/relevância de divergências |
| `GET /api/v1/relatorios/auditorias/monitoramento/exportacao` | IXC | exportar o mesmo resultado em `xlsx` ou `csv` quando a exportação for server-side |

Filtros comuns: `dataInicio`, `dataFim`, `auditorIxcId?`, `baseIxcId?`, `assuntoOsIxcId?`. A primeira rota pode devolver todos os gráficos em uma resposta para garantir que usem o mesmo recorte e reduzir chamadas. `formato=xlsx|csv` é usado na exportação.

### Tela: Divergências técnicas

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/relatorios/auditorias/divergencias/resumo` | IXC | total de divergências, motivo principal, serviço mais afetado e total auditado |
| `GET /api/v1/relatorios/auditorias/divergencias` | IXC | lista paginada e agrupada de divergências |
| `GET /api/v1/relatorios/auditorias/divergencias/{diagnosticoIxcId}/ocorrencias` | IXC | ocorrências/OS que compõem o diagnóstico agrupado |
| `GET /api/v1/relatorios/auditorias/divergencias/tecnicos` | IXC | visão agregada por técnico |
| `GET /api/v1/relatorios/auditorias/divergencias/auditores` | IXC | visão agregada e produtividade por auditor |
| `GET /api/v1/relatorios/auditorias/divergencias/categorias` | HÍBRIDA | categorias configuradas localmente e vinculadas aos diagnósticos IXC |
| `GET /api/v1/relatorios/auditorias/divergencias/exportacao` | IXC | exportação filtrada em `xlsx` ou `csv` |

Filtros: `dataInicio`, `dataFim`, `busca?`, `categoriaIxcId?`, `tecnicoIxcId?`, `auditorIxcId?`, `assuntoOsIxcId?`, `agruparPor=DIAGNOSTICO|TECNICO|AUDITOR`, paginação e ordenação.

Não existem `POST`, `PATCH` ou `DELETE` de divergência, pois essa tela representa fatos já existentes no IXC. A consulta SQL mencionada pelo responsável do projeto deve ser validada contra estas respostas antes de implementar os endpoints.

#### Análise da consulta SQL IXC fornecida em 02/09/2026

A consulta fornecida é uma boa fonte inicial para divergências. Pelo `FROM su_oss_chamado_mensagem`, cada linha deve ser tratada como **uma mensagem/ocorrência de diagnóstico**, e não automaticamente como uma OS ou auditoria única.

Mapeamento confirmado pelo SQL e pela amostra:

| Campo atual | Significado no contrato da API |
|---|---|
| `su_oss_chamado.data_abertura` | `abertoEm` da OS/chamado |
| `su_oss_chamado_mensagem.status` | estado da mensagem; na consulta está fixo em `F` |
| `su_ticket_cliente.id` | `clienteIxcId` |
| `su_ticket_cliente.razao` | `clienteNome` |
| `su_ticket.titulo` | `tituloOs`/serviço exibido |
| `su_oss_chamado_mensagem.id_operador` | identificador do operador; entidade/tabela de destino ainda não confirmada |
| `funcionarios.funcionario`, ligado por `id_tecnico` | `tecnicoNome` |
| `su_oss_assunto.assunto` | assunto de auditoria, atualmente filtrado como “DIVERGENCIA DE O.S” |
| `su_diagnostico.descricao` | `diagnostico`/motivo da divergência |
| `su_oss_chamado.data_fechamento` | `fechadoEm` da OS/chamado |

A consulta atual ainda não retorna chaves indispensáveis. O `SELECT` definitivo deve incluir, sem substituir os campos já usados:

```sql
su_oss_chamado_mensagem.id             AS ocorrencia_ixc_id,
su_oss_chamado_mensagem.id_chamado     AS chamado_ixc_id,
su_oss_chamado_mensagem.id_tecnico     AS tecnico_ixc_id,
su_oss_chamado_mensagem.id_operador    AS operador_ixc_id,
su_oss_chamado.id_ticket               AS ticket_ixc_id,
su_oss_chamado.id_assunto              AS assunto_ixc_id,
su_oss_chamado_mensagem.id_su_diagnostico AS diagnostico_ixc_id
```

Somente se for confirmado que `id_operador` referencia `funcionarios.id`, pode ser adicionado um segundo `LEFT JOIN funcionarios` para resolver o auditor:

```sql
LEFT JOIN funcionarios auditor
  ON auditor.id = su_oss_chamado_mensagem.id_operador
```

e `auditor.funcionario AS auditor_nome` no `SELECT`. O vínculo já existente por `id_tecnico = funcionarios.id` identifica um funcionário associado como técnico e explica o nome com prefixos como `RES -`, `DSL -` e `COR -` mostrado no resultado. Já não há, na SQL enviada, `JOIN` que demonstre a tabela relacionada a `id_operador`. Portanto, não considerar `id_operador` como funcionário ou auditor até localizar sua foreign key/relação real no esquema e validar ocorrências conhecidas.

##### Resolução interna do operador pelo ID

Caso a consulta principal permaneça retornando somente `id_operador`, o backend deve resolver esse ID por meio de uma **função interna do repositório IXC**. Isso não é uma rota consumida pelo frontend. O nome e a consulta dessa função só se tornam definitivos depois de confirmar qual tabela é referenciada por `id_operador`.

Contrato sugerido:

```ts
interface OperadorIxc {
  idIxc: string;
  nome: string;
  ativo: boolean;
}

async function buscarOperadorIxcPorId(
  operadorIxcId: string
): Promise<OperadorIxc | null>;

async function buscarOperadoresIxcPorIds(
  operadorIxcIds: string[]
): Promise<Map<string, OperadorIxc>>;
```

Para uma listagem ou relatório, usar obrigatoriamente `buscarOperadoresIxcPorIds`: coletar os `id_operador` distintos, executar uma única consulta parametrizada e montar o mapa `id -> operador`. Não chamar `buscarOperadorIxcPorId` uma vez para cada linha, pois isso cria o problema N+1 e degrada o relatório.

Se a relação investigada confirmar a tabela `funcionarios`, a consulta interna será:

```sql
SELECT
  funcionarios.id AS funcionario_ixc_id,
  funcionarios.funcionario AS funcionario_nome,
  funcionarios.ativo AS funcionario_ativo
FROM funcionarios
WHERE funcionarios.id IN (:ids_operadores)
```

Se `id_operador` apontar para outra tabela, substituir esse SQL e a implementação do repositório pela entidade correta. Se `funcionarios.ativo` não existir, remover esse campo do SQL e definir a regra usando a coluna de status real do IXC. A lista de IDs deve ser parametrizada pelo driver; nunca concatenada na SQL.

Fluxo de montagem da resposta:

1. Executar a consulta paginada de divergências.
2. Extrair os `id_operador` distintos e não nulos.
3. Buscar os operadores em lote na entidade que for confirmada.
4. Somente após confirmar que operador representa o auditor, preencher `auditorIxcId` e `auditorNome` em cada ocorrência.
5. Se o ID não for localizado, preservar `auditorIxcId` e retornar `auditorNome: null`; não descartar a ocorrência.

Essa função também deve ser reutilizada em monitoramento, produtividade e ranking. Um cache curto por `funcionarioIxcId` pode ser empregado, porque o nome muda com pouca frequência. Se for possível incluir o segundo `JOIN funcionarios` na consulta principal sem prejudicar o plano de execução, ele continua sendo a opção mais simples; a função em lote é a alternativa padronizada quando a SQL principal só fornecer o ID.

Há um erro lógico no filtro de clientes de teste. Com `OR`, a condição praticamente sempre será verdadeira, pois um nome dificilmente será igual aos dois testes ao mesmo tempo. Usar:

```sql
AND su_ticket_cliente.razao NOT LIKE '%TESTE-REDFOX%'
AND su_ticket_cliente.razao NOT LIKE '%CLIENTE REDFOX TESTE1%'
```

Para período, não concatenar datas vindas da requisição. Usar parâmetros preparados e intervalo semiaberto, evitando problemas com frações de segundo:

```sql
AND su_oss_chamado.data_fechamento >= :data_inicio
AND su_oss_chamado.data_fechamento <  :data_fim_exclusiva
```

Para um pedido até `29/08/2026`, `:data_fim_exclusiva` será `2026-08-30 00:00:00`. O backend deve enviar parâmetros, nunca interpolar texto SQL.

Não usar `DATE_FORMAT` no resultado consumido pela API. Retornar os campos `DATETIME` originais, ordenar por eles no banco e convertê-los para ISO 8601 no backend. Formatação `dd/MM/yyyy` pertence à interface/exportação.

##### DTO normalizado de uma ocorrência

```ts
interface OcorrenciaDivergenciaIxc {
  ocorrenciaIxcId: string;
  chamadoIxcId: string;
  ticketIxcId: string | null;
  clienteIxcId: string | null;
  clienteNome: string | null;
  tituloOs: string | null;
  assuntoIxcId: string;
  assunto: string;
  diagnosticoIxcId: string;
  diagnostico: string;
  tecnicoIxcId: string | null;
  tecnicoNome: string | null;
  auditorIxcId: string | null;
  auditorNome: string | null;
  abertoEm: string;
  fechadoEm: string;
}
```

Campos vindos de `LEFT JOIN` devem aceitar `null`. O backend não deve descartar silenciosamente uma ocorrência só porque cliente, técnico, auditor ou diagnóstico não foi encontrado; deve sinalizar o dado incompleto.

##### O que a consulta já atende

- lista e exportação de ocorrências divergentes;
- agrupamento e contagem por diagnóstico;
- principais técnicos ofensores, após incluir `tecnico_ixc_id`;
- quantidade por auditor, após confirmar e resolver `id_operador`;
- distribuição por assunto/título e por hora/data de fechamento;
- abertura do detalhe de um diagnóstico até suas ocorrências.

##### O que ela ainda não atende sozinha

- total de auditorias, pois o `WHERE` mantém apenas divergências;
- aprovações sem divergência e taxa de aprovação;
- comparação entre aprovadas e divergentes;
- categoria de divergência, pois só há diagnóstico; a categoria deve ser mapeada localmente ou obtida de outra relação IXC;
- base do técnico, pois nenhuma tabela/coluna de base foi selecionada;
- observação/texto da mensagem, pois o conteúdo da mensagem não está no `SELECT`;
- número oficial da OS, a menos que ele seja comprovadamente o título ou o ID do chamado;
- intervalo real entre baixas por auditor sem confirmar que `data_fechamento` representa o evento lançado por `id_operador`;
- ranking completo, que também depende de regras locais, atrasos/faltas e universo total auditado.

##### Efeito nas rotas

As rotas de divergências permanecem válidas, com duas alterações já aplicadas acima: o detalhe usa `diagnosticoIxcId`, e categorias passam a ser **HÍBRIDAS**. `categoriaIxcId` e `baseIxcId` só poderão ser usados como filtros depois que essas dimensões forem adicionadas à fonte.

As rotas de monitoramento e ranking não podem usar somente esta consulta filtrada. Elas precisam de uma consulta-base de **todas as auditorias elegíveis**, incluindo “AUDITORIA CONCLUIDA”, com um campo normalizado `resultado = APROVADA_SEM_DIVERGENCIA | COM_DIVERGENCIA`. A consulta de divergências pode ser uma visão filtrada dessa fonte comum.

Recomendação: criar no backend um repositório IXC que exponha fatos normalizados, e fazer os endpoints agregarem esses fatos. Não executar uma variação independente da SQL para cada cartão ou gráfico.

### Tela: Ranking geral

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/relatorios/auditorias/ranking` | HÍBRIDA | calcular ranking usando fatos IXC e regras locais vigentes |
| `GET /api/v1/relatorios/auditorias/ranking/{funcionarioIxcId}` | HÍBRIDA | detalhar composição da pontuação do funcionário |
| `POST /api/v1/relatorios/auditorias/ranking/fechamentos` | HÍBRIDA | congelar resultado de um período para premiação |
| `GET /api/v1/relatorios/auditorias/ranking/fechamentos` | LOCAL | listar fechamentos anteriores |
| `GET /api/v1/relatorios/auditorias/ranking/fechamentos/{id}` | LOCAL | consultar snapshot de um fechamento |

Filtros de cálculo: `dataInicio`, `dataFim`, `baseIxcId?`, `cargoIxcId?`. O retorno inclui posição, pontuação final, alta performance, premiado e composição completa.

### Tela: Pontuação por O.S.

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/integracoes/ixc/assuntos-os` | IXC | listar assuntos de OS disponíveis para parametrização |
| `GET /api/v1/configuracoes/pontuacao-os` | LOCAL | listar regras e vigências |
| `POST /api/v1/configuracoes/pontuacao-os` | LOCAL | criar regra para um assunto IXC |
| `PATCH /api/v1/configuracoes/pontuacao-os/{id}` | LOCAL | alterar pontos, vigência ou estado ativo |
| `DELETE /api/v1/configuracoes/pontuacao-os/{id}` | LOCAL | inativar regra ainda não usada; nunca apagar histórico utilizado |
| `GET /api/v1/configuracoes/ranking` | LOCAL | consultar pesos gerais e limite de alta performance |
| `POST /api/v1/configuracoes/ranking` | LOCAL | criar nova configuração com vigência |

### Tela: Devolução de equipamentos

Esta rota do frontend existe atualmente, embora possa não aparecer no menu principal.

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/devolucoes` | LOCAL | listar registros com filtros e paginação |
| `POST /api/v1/devolucoes` | LOCAL | registrar devolução |
| `GET /api/v1/devolucoes/{id}` | LOCAL | consultar detalhes |
| `PATCH /api/v1/devolucoes/{id}` | LOCAL | editar campos permitidos |
| `DELETE /api/v1/devolucoes/{id}` | LOCAL | exclusão lógica com `motivoExclusao` |
| `GET /api/v1/devolucoes/exportacao` | LOCAL | exportar registros filtrados |
| `GET /api/v1/integracoes/ixc/equipamentos/identificadores` | IXC | buscar por `tipo=MAC|SERIAL` e `busca` |
| `GET /api/v1/integracoes/ixc/funcionarios` | IXC | selecionar funcionário/técnico |
| `GET /api/v1/integracoes/ixc/clientes` | IXC | selecionar/validar cliente |
| `GET /api/v1/integracoes/ixc/modelos-equipamento` | IXC | selecionar modelo |
| `GET /api/v1/configuracoes/motivos-devolucao` | LOCAL | opções de motivo |
| `GET /api/v1/configuracoes/paradeiros` | LOCAL | opções de paradeiro |

Filtros da listagem: `busca`, `dataInicio`, `dataFim`, `motivoId`, `paradeiroId`, `status`, `recebimento`, `baseIxcId`, `apenasDuplicados`.

### Tela: Registro de devolução

Usa o mesmo recurso `/devolucoes`. Esta tela demanda ainda:

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/devolucoes/validar-identificador` | HÍBRIDA | verificar duplicidade local e correspondência IXC de MAC/serial |
| `PATCH /api/v1/devolucoes/{id}/status` | LOCAL | registrar transição de estado com justificativa quando necessária |

Não criar um segundo conjunto de tabelas ou endpoints para as duas telas de devolução; elas representam visões diferentes do mesmo recurso local.

## Módulo: Conferência

### Tela: Calendário de agendamentos

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/agendamentos?setor=CONFERENCIA` | LOCAL | listar eventos do intervalo visível |
| `POST /api/v1/agendamentos` | LOCAL | criar um agendamento por técnico selecionado |
| `PATCH /api/v1/agendamentos/{id}` | LOCAL | mover data/hora, editar tipo ou observação |
| `PATCH /api/v1/agendamentos/{id}/status` | LOCAL | alterar status pelo quadro/calendário |
| `DELETE /api/v1/agendamentos/{id}` | LOCAL | cancelar com motivo; não apagar fisicamente |
| `GET /api/v1/integracoes/ixc/tecnicos` | IXC | opções de técnicos por base e estado ativo |
| `GET /api/v1/integracoes/ixc/bases` | IXC | opções de base |
| `GET /api/v1/agendamentos/exportacao?setor=CONFERENCIA` | LOCAL | exportar semana ou mês quando feito no servidor |

`POST /agendamentos` pode receber `tecnicoIxcIds[]`, criando um registro para cada técnico na mesma transação.

### Tela: Checklist

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/agendamentos?setor=CONFERENCIA&status=AGENDADO` | LOCAL | selecionar agendamento pendente |
| `GET /api/v1/integracoes/ixc/tecnicos/{id}/inventario?modalidade=CONFERENCIA` | IXC | carregar produtos, patrimônios e quantidades esperadas |
| `GET /api/v1/integracoes/ixc/produtos` | IXC | pesquisar item extra/manual |
| `GET /api/v1/integracoes/ixc/patrimonios` | IXC | pesquisar patrimônio por MAC/serial |
| `POST /api/v1/checklists` | LOCAL | iniciar checklist e congelar snapshot da carga utilizada |
| `PUT /api/v1/checklists/{id}/itens` | LOCAL | salvar rascunho integral dos itens contados |
| `POST /api/v1/checklists/{id}/concluir` | LOCAL | concluir, anexar assinatura, atualizar agenda e gerar vales atomicamente |
| `POST /api/v1/checklists/{id}/cancelar` | LOCAL | cancelar checklist em andamento com motivo |

O frontend não deve criar os vales separadamente após concluir. O backend conclui checklist, marca agendamento e cria os vales em uma única transação.

### Tela: Histórico de checklist

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/checklists?modalidade=CONFERENCIA` | LOCAL | histórico paginado e filtrado |
| `GET /api/v1/checklists/{id}` | LOCAL | detalhes, itens e assinaturas |
| `GET /api/v1/checklists/{id}/documento` | LOCAL | obter PDF persistido ou gerá-lo no backend |

Filtros: `busca`, `tipo`, `tecnicoIxcId`, `baseIxcId`, `status`, `dataInicio`, `dataFim`, `comDivergencia?`.

### Tela: Controle de vales

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/vales?setor=CONFERENCIA` | LOCAL | listar e totalizar vales conforme filtros |
| `GET /api/v1/vales/resumo?setor=CONFERENCIA` | LOCAL | cartões e gráficos por status/período |
| `GET /api/v1/vales/{id}` | LOCAL | detalhes e itens |
| `POST /api/v1/vales` | LOCAL | registrar vale avulso |
| `PATCH /api/v1/vales/{id}` | LOCAL | corrigir dados permitidos enquanto pendente |
| `PATCH /api/v1/vales/{id}/status` | LOCAL | aplicar, justificar, abonar ou cancelar |
| `POST /api/v1/vales/{id}/assinatura` | LOCAL | registrar assinatura do desconto |
| `GET /api/v1/vales/{id}/documento` | LOCAL | baixar/gerar PDF |
| `GET /api/v1/vales/exportacao?setor=CONFERENCIA` | LOCAL | exportar conjunto filtrado |

Filtros: `busca`, `status`, `origem`, `tipoChecklist`, `tecnicoIxcId`, `dataInicio`, `dataFim`, `ordenarPor`.

### Tela: Relatório de checklist

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/relatorios/checklists?modalidade=CONFERENCIA` | LOCAL | KPIs e séries mensais |
| `GET /api/v1/relatorios/checklists/divergencias-tecnicos?modalidade=CONFERENCIA` | LOCAL | ranking de faltantes/excedentes por técnico |
| `GET /api/v1/relatorios/vales?setor=CONFERENCIA` | LOCAL | evolução e distribuição financeira dos vales |

Filtros: `dataInicio`, `dataFim`, `baseIxcId?`, `tecnicoIxcId?`, `tipo?`.

### Tela: Termo de devolução — Novo termo

| Método e rota | Origem | Finalidade |
|---|---|---|
| `POST /api/v1/termos-devolucao` | LOCAL | criar termo e seus itens |
| `GET /api/v1/integracoes/ixc/funcionarios` | IXC | selecionar funcionário |
| `GET /api/v1/integracoes/ixc/equipamentos/identificadores` | IXC | preencher equipamento por MAC ou serial |
| `GET /api/v1/integracoes/ixc/clientes` | IXC | resolver código/nome do cliente |
| `GET /api/v1/integracoes/ixc/produtos` | IXC | selecionar produto devolvido |

### Tela: Termo de devolução — Fila de assinatura

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/termos-devolucao?status=AGUARDANDO_ASSINATURA` | LOCAL | listar fila |
| `POST /api/v1/termos-devolucao/{id}/assinatura` | LOCAL | salvar assinatura e mudar para `ASSINADO` |
| `POST /api/v1/termos-devolucao/{id}/token-assinatura` | LOCAL | gerar link/token para tablet |
| `DELETE /api/v1/termos-devolucao/{id}` | LOCAL | cancelar termo ainda não finalizado, com motivo |
| `GET /api/v1/termos-devolucao/fila/exportacao` | LOCAL | exportar fila |

### Tela: Assinatura no tablet

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/publico/termos-devolucao/assinatura/{token}` | LOCAL | validar token e retornar somente dados necessários à conferência |
| `POST /api/v1/publico/termos-devolucao/assinatura/{token}` | LOCAL | enviar assinatura e consumir token |

Não usar o ID sequencial do termo como credencial pública.

### Tela: Termo de devolução — Envio, assinados, baixa e exportação

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/termos-devolucao?status=ASSINADO` | LOCAL | fila de envio |
| `POST /api/v1/termos-devolucao/{id}/enviar` | LOCAL | gerar PDF, registrar envio e mudar para `ENVIADO` |
| `GET /api/v1/termos-devolucao?status=ASSINADO,ENVIADO,BAIXADO,ARQUIVADO` | LOCAL | listar termos assinados |
| `GET /api/v1/termos-devolucao/{id}/documento` | LOCAL | baixar PDF do termo |
| `POST /api/v1/termos-devolucao/{id}/baixar` | LOCAL | registrar baixa e mudar para `BAIXADO` |
| `POST /api/v1/termos-devolucao/{id}/arquivar` | LOCAL | mudar para `ARQUIVADO` |
| `POST /api/v1/termos-devolucao/exportacoes` | LOCAL | gerar ZIP de termos selecionados; corpo contém `termoIds[]` |

Se “enviar” significar e-mail ou outra integração externa, o backend deve registrar destinatário, resultado e tentativa; a rota continua a mesma.

### Tela: Relatório de devolução

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/relatorios/termos-devolucao` | LOCAL | indicadores, agrupamentos por estado/modelo e listagem analítica |
| `GET /api/v1/relatorios/termos-devolucao/exportacao` | LOCAL | exportar o recorte |

## Módulo: Ferramental

### Tela: Calendário de agendamentos

Usa as mesmas rotas de calendário da Conferência com `setor=FERRAMENTAL`.

### Tela: Checklist do ferramental

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/agendamentos?setor=FERRAMENTAL&status=AGENDADO` | LOCAL | selecionar agendamento |
| `GET /api/v1/integracoes/ixc/tecnicos/{id}/inventario?modalidade=FERRAMENTAL` | IXC | carregar ferramentas atribuídas |
| `GET /api/v1/integracoes/ixc/ferramentas` | IXC | pesquisar ferramenta extra |
| `POST /api/v1/checklists` | LOCAL | iniciar com `modalidade=FERRAMENTAL` |
| `PUT /api/v1/checklists/{id}/itens` | LOCAL | salvar presentes, ausentes e extras |
| `POST /api/v1/checklists/{id}/concluir` | LOCAL | concluir e gerar vales dos ausentes |
| `POST /api/v1/checklists/{id}/cancelar` | LOCAL | cancelar com motivo |

### Tela: Histórico de checklist

Usa `GET /checklists?modalidade=FERRAMENTAL`, `GET /checklists/{id}` e `GET /checklists/{id}/documento`.

### Tela: Controle de vales

Usa as rotas `/vales` com `setor=FERRAMENTAL`. A correção de valor mostrada na UI é `PATCH /vales/{id}` e só pode ocorrer enquanto o vale estiver pendente, sempre com auditoria.

### Tela: Relatório de checklist

Usa:

- `GET /api/v1/relatorios/checklists?modalidade=FERRAMENTAL`;
- `GET /api/v1/relatorios/checklists/divergencias-tecnicos?modalidade=FERRAMENTAL`;
- `GET /api/v1/relatorios/vales?setor=FERRAMENTAL`.

O retorno deve contemplar execução mensal, divergências mensais, vales mensais, distribuição por status e ranking financeiro.

## Módulo: Frota

### Tela: Calendário de frotas

Usa as mesmas rotas de agendamento com `setor=FROTA`, mais:

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/integracoes/frotas/veiculos` | A CONFIRMAR | opções de veículo quando o agendamento passar a exigir veículo |

A fonte de veículos precisa ser confirmada; não assumir que pertence ao IXC.

### Tela: Controle de vales de frota

Usa `/vales` com `setor=FROTA`: listagem, resumo, detalhe, criação avulsa, edição, status, assinatura, documento e exportação. Itens específicos incluem descrição e identificação/placa no snapshot.

## Módulo: Colaboradores

### Tela: Colaboradores e escalas

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/integracoes/ixc/funcionarios` | IXC | listar funcionários e dados funcionais |
| `GET /api/v1/integracoes/ixc/funcionarios/{id}` | IXC | detalhes do funcionário |
| `GET /api/v1/integracoes/ixc/bases` | IXC | filtro por base |
| `GET /api/v1/integracoes/ixc/cargos` | IXC | filtro por cargo |
| `GET /api/v1/funcionarios/{funcionarioIxcId}/escala` | LOCAL | obter complemento local de escala, se ele não existir na fonte oficial |
| `PUT /api/v1/funcionarios/{funcionarioIxcId}/escala` | LOCAL | criar/atualizar complemento local de escala |

Se a escala e os horários já existirem em fonte corporativa oficial, remover as duas rotas locais e expor esses campos na consulta IXC.

### Tela: Atrasos de ponto

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/integracoes/ponto/registros` | A CONFIRMAR | listar atrasos, faltas e marcações da fonte oficial |
| `GET /api/v1/relatorios/ponto/resumo` | A CONFIRMAR | KPIs do período |
| `POST /api/v1/ponto/ajustes` | LOCAL | solicitar/registrar justificativa ou ajuste local, se permitido pelo processo |
| `PATCH /api/v1/ponto/ajustes/{id}` | LOCAL | alterar justificativa pendente |
| `DELETE /api/v1/ponto/ajustes/{id}` | LOCAL | cancelar ajuste local não processado |

A tela atual permite criar, editar e excluir mocks de ponto, mas o backend não deve editar diretamente o ponto oficial até a fonte e a regra de integração serem confirmadas.

### Tela: Cargos e funções

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/integracoes/ixc/cargos` | IXC | listar cargos e funções oficiais |

Não oferecer `POST`, `PATCH` ou `DELETE` se o IXC for a fonte oficial. Os botões de CRUD atuais devem ser removidos ou convertidos em administração IXC fora deste sistema. Se os cargos forem comprovadamente exclusivos do Gerenciador, eles deixam de ser IXC e recebem CRUD local após revisão do modelo.

## Módulo: Usuários

### Tela: Acessos ao sistema

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/usuarios` | LOCAL | listar usuários com vínculo, grupos e estado |
| `POST /api/v1/usuarios` | LOCAL | criar usuário e opcionalmente vinculá-lo ao funcionário IXC |
| `GET /api/v1/usuarios/{id}` | LOCAL | detalhes e horários/complementos locais |
| `PATCH /api/v1/usuarios/{id}` | LOCAL | editar nome de exibição, login, vínculo e grupos |
| `PATCH /api/v1/usuarios/{id}/status` | LOCAL | ativar/bloquear usuário |
| `POST /api/v1/usuarios/{id}/redefinir-senha` | LOCAL | gerar redefinição ou senha temporária |
| `GET /api/v1/integracoes/ixc/funcionarios` | IXC | pesquisar funcionário para vínculo |
| `GET /api/v1/grupos-permissao?ativo=true` | LOCAL | opções de grupos |

### Tela: Grupos de permissões

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/grupos-permissao` | LOCAL | listar grupos e total de usuários |
| `POST /api/v1/grupos-permissao` | LOCAL | criar grupo |
| `GET /api/v1/grupos-permissao/{id}` | LOCAL | detalhes |
| `PATCH /api/v1/grupos-permissao/{id}` | LOCAL | editar nome, descrição e estado |
| `DELETE /api/v1/grupos-permissao/{id}` | LOCAL | inativar grupo sem vínculos impeditivos |

### Tela: Acessos permitidos do grupo

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/permissoes` | LOCAL | catálogo agrupado por módulo |
| `GET /api/v1/grupos-permissao/{id}/permissoes` | LOCAL | permissões marcadas |
| `PUT /api/v1/grupos-permissao/{id}/permissoes` | LOCAL | substituir conjunto de permissões de forma atômica |

## Módulo: Cadastros

As páginas de cadastro existem no código, embora o menu atualmente as oculte.

### Tela: Bases

- `GET /api/v1/integracoes/ixc/bases` — listar e pesquisar bases oficiais.
- Sem CRUD local enquanto IXC for a fonte da verdade.

### Tela: Técnicos por base

- `GET /api/v1/integracoes/ixc/tecnicos?baseIxcId=&ativo=` — listar técnicos.
- `GET /api/v1/integracoes/ixc/tecnicos/{id}` — detalhes.
- Sem CRUD local.

### Tela: Classes

- Se classe vier do IXC: `GET /api/v1/integracoes/ixc/classes-tecnico`.
- Se classe for local: `GET`, `POST /api/v1/configuracoes/classes-tecnico`; `PATCH`, `DELETE /api/v1/configuracoes/classes-tecnico/{id}`; e `PUT /api/v1/configuracoes/tecnicos/{tecnicoIxcId}/classe`.

Somente uma das duas alternativas deve ser implementada após confirmar a origem.

### Tela: Produtos e ferramentas

- `GET /api/v1/integracoes/ixc/produtos`.
- `GET /api/v1/integracoes/ixc/ferramentas`.
- Sem CRUD local enquanto forem catálogos oficiais.

### Tela: Clientes/importações

- `GET /api/v1/integracoes/ixc/clientes`.
- `GET /api/v1/integracoes/ixc/clientes/{id}`.
- Não importar, cadastrar ou excluir cópias locais de clientes.

### Tela: Parâmetros de devolução

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/configuracoes/motivos-devolucao` | LOCAL | listar ativos e inativos |
| `POST /api/v1/configuracoes/motivos-devolucao` | LOCAL | criar motivo |
| `PATCH /api/v1/configuracoes/motivos-devolucao/{id}` | LOCAL | renomear ou ativar/inativar |
| `DELETE /api/v1/configuracoes/motivos-devolucao/{id}` | LOCAL | inativar se já utilizado |
| `GET /api/v1/configuracoes/paradeiros` | LOCAL | listar ativos e inativos |
| `POST /api/v1/configuracoes/paradeiros` | LOCAL | criar paradeiro |
| `PATCH /api/v1/configuracoes/paradeiros/{id}` | LOCAL | renomear ou ativar/inativar |
| `DELETE /api/v1/configuracoes/paradeiros/{id}` | LOCAL | inativar se já utilizado |

## Módulo: Conta

### Tela: Configurações

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/conta/perfil` | LOCAL | obter perfil do usuário autenticado |
| `PATCH /api/v1/conta/perfil` | LOCAL | alterar somente campos pessoais permitidos |
| `GET /api/v1/conta/preferencias` | LOCAL | carregar tema e preferências |
| `PUT /api/v1/conta/preferencias` | LOCAL | salvar tema e preferências |
| `POST /api/v1/conta/alterar-senha` | LOCAL | validar `senhaAtual`, atualizar senha e revogar outras sessões |

### Tela: Suporte

| Método e rota | Origem | Finalidade |
|---|---|---|
| `POST /api/v1/suporte/chamados` | LOCAL | abrir chamado com categoria, prioridade, assunto e descrição |
| `POST /api/v1/suporte/arquivos` | LOCAL | enviar anexo antes ou junto do chamado |
| `GET /api/v1/suporte/chamados` | LOCAL | listar chamados do próprio usuário |
| `GET /api/v1/suporte/chamados/{id}` | LOCAL | acompanhar chamado |

Se for mantido apenas o comportamento atual de abrir o cliente de e-mail via `mailto:`, a tela é **SEM API** e essas rotas podem aguardar uma central de suporte real.

## Módulo: Público

### Tela: Assinatura de vales pelo técnico

| Método e rota | Origem | Finalidade |
|---|---|---|
| `GET /api/v1/publico/vales/assinatura/{token}` | LOCAL | validar token e listar apenas os vales incluídos nele |
| `POST /api/v1/publico/vales/assinatura/{token}` | LOCAL | assinar todos os vales autorizados e consumir token atomicamente |

Para iniciar o fluxo autenticado:

| Método e rota | Origem | Finalidade |
|---|---|---|
| `POST /api/v1/vales/tokens-assinatura` | LOCAL | gerar token para `valeIds[]` ou para pendências de um técnico e setor |

Não expor pesquisa pública irrestrita por nome de técnico. O token deve conter escopo, expiração e conjunto exato de vales; a assinatura não pode atingir vales criados depois da emissão do token.

## Rotas compartilhadas de integração IXC

Estas rotas são reutilizadas pelas telas e não devem ser duplicadas por módulo:

| Método e rota | Parâmetros principais |
|---|---|
| `GET /api/v1/integracoes/ixc/status` | nenhum; informa disponibilidade e última consulta válida |
| `GET /api/v1/integracoes/ixc/funcionarios` | `busca`, `baseIxcId`, `cargoIxcId`, `ativo`, paginação |
| `GET /api/v1/integracoes/ixc/tecnicos` | `busca`, `baseIxcId`, `classeIxcId`, `ativo`, paginação |
| `GET /api/v1/integracoes/ixc/bases` | `busca`, `ativo` |
| `GET /api/v1/integracoes/ixc/cargos` | `busca`, `ativo` |
| `GET /api/v1/integracoes/ixc/clientes` | `busca`, `codigo`, paginação |
| `GET /api/v1/integracoes/ixc/produtos` | `busca`, `filialIxcId`, `tipo`, paginação |
| `GET /api/v1/integracoes/ixc/patrimonios` | `busca`, `mac`, `serialNumber`, `clienteIxcId`, paginação |
| `GET /api/v1/integracoes/ixc/ferramentas` | `busca`, `serialNumber`, paginação |
| `GET /api/v1/integracoes/ixc/equipamentos/identificadores` | `tipo=MAC|SERIAL`, `busca`, `limite` |
| `GET /api/v1/integracoes/ixc/tecnicos/{id}/inventario` | `modalidade`, `dataReferencia` |
| `GET /api/v1/integracoes/ixc/assuntos-os` | `busca`, `ativo`, paginação |

Todas retornam `fonte: "IXC"`, `consultadoEm` e `desatualizado`. Se uma consulta essencial estiver indisponível, responder `503 IXC_INDISPONIVEL` em vez de retornar lista vazia.

## Operações que permanecem no frontend

Não exigem endpoint separado:

- trocar visão diária/semanal/mensal do calendário depois de carregar o intervalo;
- ordenar ou filtrar uma pequena lista já carregada;
- desenhar assinatura antes do envio;
- pré-visualizar documento;
- gerar PDF local temporário, quando ele não precisar ser armazenado ou auditado;
- alternar tema imediatamente, embora a preferência persistente use API.

## Ordem recomendada de implementação

1. Autenticação, usuários, grupos e permissões.
2. Adaptadores IXC de funcionários, técnicos, bases, clientes e inventário.
3. Agendamentos e checklists com conclusão transacional.
4. Vales, assinaturas e documentos.
5. Termos e registros de devolução.
6. Relatórios locais.
7. Consultas de auditoria/divergência e ranking IXC.
8. Suporte, ponto, frota e cadastros cuja fonte ainda precisa de confirmação.

## Pendências para homologar a consulta SQL de divergências

A SQL inicial já foi analisada na seção da tela de divergências. Ainda é necessário confirmar com dados conhecidos e com o responsável pelo IXC:

1. qual coluna é a chave única da auditoria e qual é a chave da OS;
2. como ela identifica o técnico e o auditor, preferencialmente por ID e não nome;
3. qual campo distingue aprovação sem divergência de divergência;
4. diagnóstico, categoria, assunto da OS e observação disponíveis;
5. tratamento de OS reaberta, cancelada ou auditada mais de uma vez;
6. timezone dos campos de data;
7. se uma linha representa uma auditoria, uma divergência ou um item divergente;
8. possibilidade de aplicar período, técnico, auditor, base e assunto no banco;
9. índices necessários e custo da consulta;
10. se a mesma SQL atende monitoramento, divergências e ranking ou se deve alimentar uma view normalizada comum.

Depois dessas confirmações, devem ser fechados os DTOs das rotas de monitoramento e divergências sem alterar os demais contratos deste documento.
