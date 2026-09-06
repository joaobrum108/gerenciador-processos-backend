# API de registros de devolução — desenho

Data: 2026-09-06
Projeto: `gerenciador-processos-backend`

## Objetivo

Expor CRUD HTTP para `registros_devolucao`, de modo que a tela
`auditorias/registroDevolucao.vue` possa sair do mock. Esta entrega cobre
**apenas o backend, com testes**. A ligação do frontend é etapa seguinte.

## Ponto de partida

As tabelas já existem e estão corretas. Verificado criando um banco vazio,
rodando `prisma migrate deploy` e comparando `pg_dump` com o banco de
desenvolvimento: `registros_devolucao`, `motivos_devolucao` e `paradeiros`
saem idênticas, com FKs, enums, triggers e CHECKs.

Nenhuma migration é necessária. O que falta é exclusivamente a camada de API:
grep por `registros_devolucao`, `motivos_devolucao` e `paradeiros` em `src/`
retorna zero ocorrências.

Não existem — nem devem existir — tabelas locais de `produtos`, `patrimonios`
ou `modelos`. `specs/01-dominio-local.md:422` do projeto de banco proíbe
cadastros mestres locais para dados do IXC, e a linha 452 prescreve preservar
o valor digitado marcando o registro como não conciliado. Os campos
`modelo_nome_snapshot`, `mac` e `serial_number` já implementam isso.

A tela de registro de devolução não captura patrimônio; esse conceito vive em
`termo_itens.tipo_item`, que pertence à tela de devolução de equipamentos.

## Arquitetura

Segue o padrão de `pontuacao-os`, o CRUD local mais recente do projeto.

| Arquivo | Papel |
| --- | --- |
| `src/repositories/registros-devolucao.repository.ts` | SQL puro via `consultar` |
| `src/services/registros-devolucao.service.ts` | factory com injeção de dependência |
| `src/controllers/registros-devolucao.controller.ts` | Zod, paginação, contexto do ator |
| `src/routes/registros-devolucao.routes.ts` | as cinco rotas |
| `src/router.ts` | monta em `/registros-devolucao` |
| `tests/registros-devolucao.service.test.ts` | testes de service com repositório fake |

O service é `criarRegistrosDevolucaoService({ repositorio })`, espelhando
`criarPontuacaoOsService`. Isso mantém os testes sem banco.

## Rotas

Todas sob `/api/v1/registros-devolucao`, atrás de `autenticar` e
`autorizar("auditorias.registroDevolucao.view")`.

| Método | Caminho | Ação |
| --- | --- | --- |
| GET | `/` | lista paginada |
| GET | `/:id` | detalhe |
| POST | `/` | cria |
| PUT | `/:id` | edita |
| DELETE | `/:id` | exclui (lógica) |

### GET `/`

Query: `dataInicio`, `dataFim` (sobre `data_retirada`), `somenteDuplicados`,
mais `pagina`, `porPagina`, `ordenarPor`, `ordem` via `esquemaPaginacao`.
Cobre os filtros que a tela já tem e nada além.

`ordenarPor` aceita `dataRetirada`, `numero`, `funcionarioNomeSnapshot`,
`status` e `criadoEm`; o padrão é `dataRetirada` com `ordem` `desc`. A lista
é fechada porque o valor entra na cláusula `ORDER BY`, e `esquemaPaginacao`
já a valida com `z.enum`.

Resposta no formato `montarResposta`:
`{ dados, pagina, porPagina, total, totalPaginas }`.

Datas saem como `YYYY-MM-DD` via `to_char`, para casar com o tipo `DataISO`
do frontend.

### POST `/`

```jsonc
{
  "dataRetirada": "2026-09-06",
  "funcionarioIxcId": "123",
  "funcionarioNomeSnapshot": "Fulano",
  "baseIxcId": "4",
  "baseNomeSnapshot": "Base Centro",
  "classeNomeSnapshot": "TEC I",
  "clienteIxcId": "99",
  "clienteCodigoSnapshot": "10045",
  "clienteNomeSnapshot": "ACME",
  "modeloIxcId": "7",
  "modeloNomeSnapshot": "ONU XPTO",
  "mac": "AABBCCDDEEFF",
  "serialNumber": "ABC-123",
  "motivoId": "uuid",
  "paradeiroId": "uuid",
  "recebimento": "PENDENTE",
  "status": "PENDENTE",
  "dataDevolucao": null,
  "observacao": null
}
```

`dataDevolucao` é opcional e existe porque a coluna e o CHECK
`registros_devolucao_datas_check` já existem: quando informada, precisa ser
maior ou igual a `dataRetirada`, validado no service antes de chegar ao banco.
A tela ainda não coleta esse campo; sem ele o registro grava `null`, que é o
comportamento atual do mock.

`numero` vem da sequence. `auditor_usuario_id` e `criado_por_usuario_id` vêm
do usuário autenticado, nunca do payload. `conciliadoIxc` não é aceito do
cliente — ver regras.

### PUT `/:id`

Mesmo corpo do POST. Não altera `numero`, `criado_por_usuario_id` nem
`criado_em`. Recusa registro já excluído.

### DELETE `/:id`

Sem corpo. Grava `excluido_em`, `excluido_por_usuario_id` e preenche
`motivo_exclusao` no service com `"Excluído pelo usuário"`, porque o CHECK
`registros_devolucao_exclusao_check` exige o motivo quando `excluido_em` é
preenchido, e esse CHECK vive no projeto de banco, fora do escopo desta
entrega. Do ponto de vista de quem chama, é um DELETE simples.

## Regras de negócio

**Normalização.** MAC vira 12 hexadecimais maiúsculos e é gravado formatado
com `:`. Serial vira maiúsculo, sem espaços nas pontas. Espelha
`normalizarCodigo` e `formatarMac` da tela.

**Validação.** Zod com os mesmos formatos do frontend: código de cliente
`/^\d{3,20}$/`, MAC com 12 hexadecimais, serial `[A-Z0-9-]{4,40}`.

**Duplicidade.** Bloqueia apenas quando já existe outro registro não excluído
e com status `PENDENTE` de mesmo MAC ou serial normalizado. Respeita a spec
("alerta, não bloqueio absoluto"): o mesmo equipamento pode voltar depois que
a devolução anterior for resolvida. Usa os índices normalizados já existentes
na tabela.

**Conciliação com o IXC.** O service decide, o cliente não. Se `modeloIxcId`
vier nulo — o usuário digitou em vez de escolher da busca do IXC — grava
`conciliado_ixc = false`. Torna impossível o frontend marcar como conciliado
algo que não veio do IXC.

**Exclusão lógica.** Listagem e detalhe nunca retornam registros com
`excluido_em` preenchido. `GET /:id`, `PUT /:id` e `DELETE /:id` sobre um
registro já excluído respondem 404, e não 200 nem 409: para quem chama, o
registro não existe mais.

## Decisões conscientes

**Autorização reusa `auditorias.registroDevolucao.view` nos cinco verbos.**
É a única permissão que o catálogo tem para esta tela, e é o mesmo que
`pontuacao-os.routes.ts` já faz. Criar `.criar`/`.editar`/`.excluir` exigiria
mexer no catálogo do `api-db-redfox-process` e resemear — outro projeto.
Fraqueza conhecida, registrada de propósito.

**Snapshots do IXC vêm no payload.** Não existe repositório de clientes nem de
modelos do IXC no backend. O frontend já tem esses objetos das suas buscas e
envia id + nome.

## Testes

`tests/registros-devolucao.service.test.ts`, no padrão de
`pontuacao-os.service.test.ts` (`node:test` via `tsx`), com repositório fake:

- normalização de MAC e serial
- rejeição de duplicado quando existe pendente com mesmo MAC ou serial
- aceitação quando o registro anterior está `DEVOLVIDO`
- `conciliado_ixc = false` quando `modeloIxcId` é nulo
- exclusão lógica preenchendo os três campos
- listagem ignorando excluídos
- validações de formato

Fechamento: `npm test` e `npm run typecheck`.

## Fora de escopo

- Ligar o frontend (troca dos mocks por chamadas reais)
- CRUD de `motivos_devolucao` e `paradeiros`, que também não têm rota
- `GET /cargos` e `GET /clientes`, que o frontend chama e retornam 404
- Qualquer migration ou mudança no `api-db-redfox-process`
