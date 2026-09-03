# Contrato do backend para o frontend

Atualizado em: 02/09/2026.

Esta pasta é a referência de integração entre o frontend e o backend. Antes de ligar uma tela à API, leia os documentos nesta ordem:

1. [`01-integracao-frontend.md`](./01-integracao-frontend.md): checklist do `.env`, `api.ts`, autenticação e tratamento de erros.
2. [`02-api-implementada.md`](./02-api-implementada.md): rotas e contratos que existem no código hoje.
3. [`03-rotas-backend.md`](./03-rotas-backend.md): planejamento das rotas futuras por tela. Uma rota presente somente nesse arquivo ainda não pode ser consumida.

## Estado atual resumido

O backend implementa somente:

- saúde;
- login, renovação, logout e usuário autenticado;
- usuários;
- grupos de permissão;
- catálogo de permissões.

Não estão implementados ainda os módulos de auditoria, IXC, agendamentos, checklists, vales, devoluções, frota, ponto, conta e suporte. Eles aparecem no documento `03` como planejamento.

## Bloqueios: resolvidos em 03/09/2026

Os quatro itens que impediam a integração foram corrigidos e verificados contra o servidor rodando. Ficam registrados aqui porque versões anteriores desta pasta os descreviam como pendentes:

| Item              | Situação                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Prefixo `/api/v1` | **Montado.** Use `VITE_API_URL=http://localhost:3200/api/v1`                                            |
| CORS              | **Configurado** (`app.use(cors())`). O proxy do Vite continua útil, mas deixou de ser obrigatório      |
| Erros e 404 JSON  | **Registrados.** Todo erro sai no contrato `{ mensagem, codigo, campos? }`; nada mais volta em HTML     |
| Porta             | **`PORT` tem fallback `3200`**, e a API valida `DATABASE_URL`, `JWT_SECRET` e `PORT` no boot            |

Duas correções afetam diretamente as telas de usuários e grupos:

| Item                              | Situação                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Editar usuário ou grupo           | **Funciona.** O `PATCH` respondia `409 REGISTRO_DESATUALIZADO` sempre, por precisão de microssegundos no `atualizadoEm`. Hoje o `409` só aparece em conflito real |
| Rotas de usuários sem autorização | **Fechadas.** Cinco rotas aceitavam qualquer usuário autenticado; todas exigem `usuarios.acessosSistema.view`           |

## Fonte da verdade

Quando houver conflito:

- `02-api-implementada.md` descreve o comportamento presente;
- `03-rotas-backend.md` descreve o objetivo futuro;
- o código executável continua sendo a validação final até existir OpenAPI gerado/testado automaticamente.
