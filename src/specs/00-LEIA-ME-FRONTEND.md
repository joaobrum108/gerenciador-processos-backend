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

## Atenção: bloqueios encontrados no código atual

Estes itens refletem o servidor executado por `npm run dev`, mesmo que o README antigo indique outra coisa:

| Item              | Situação atual                                                    | Efeito no frontend                                                                                     |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prefixo `/api/v1` | Não está montado em `src/router.ts`                               | A URL real atual é `http://localhost:3200/auth/login`, e não `/api/v1/auth/login`                      |
| CORS              | Não está configurado                                              | Um frontend em outra origem/porta será bloqueado pelo navegador, salvo uso de proxy de desenvolvimento |
| Erros e 404 JSON  | Os middlewares existem, mas não são registrados em `src/index.ts` | Erros podem chegar no formato padrão do Express, inclusive HTML, em vez do contrato JSON               |

| Porta | `PORT` não possui fallback no código | O `.env` do backend deve definir `PORT` |

O frontend pode ser preparado com o contrato abaixo, mas a integração completa depende da correção desses itens no backend. A recomendação é padronizar o backend em `/api/v1` e configurar o frontend com `VITE_API_URL=http://localhost:3200/api/v1` depois dessa correção.

## Fonte da verdade

Quando houver conflito:

- `02-api-implementada.md` descreve o comportamento presente;
- `03-rotas-backend.md` descreve o objetivo futuro;
- o código executável continua sendo a validação final até existir OpenAPI gerado/testado automaticamente.
