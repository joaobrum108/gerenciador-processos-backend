# Gerenciador de Processos — Backend

API do Gerenciador de Processos RedFox. Escopo atual: autenticação, usuários, grupos de permissão e catálogo de permissões.

Este projeto **não cria tabelas**. O schema do banco pertence ao projeto `api-db-redfox-process`.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL rodando com o banco `redfox` criado e as tabelas já aplicadas

## Instalação

```bash
npm install
```

## Configuração

Copie o `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

| Variável | Exemplo | Para que serve |
|---|---|---|
| `PORT` | `3200` | porta do servidor |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/redfox` | conexão com o Postgres |
| `JWT_SECRET` | qualquer texto longo | assina o access token |
| `JWT_EXPIRACAO` | `15m` | validade do access token |
| `REFRESH_EXPIRACAO_DIAS` | `7` | validade do refresh token |
| `BCRYPT_ROUNDS` | `10` | custo do hash de senha |

## Rodando

```bash
npm run dev
```

Servidor em `http://localhost:3200`. Teste rápido:

```bash
curl http://localhost:3200/api/v1/saude
```

Se o Postgres estiver parado no Windows, suba o serviço como administrador:

```powershell
Start-Service postgresql-x64-18
```

## Outros comandos

```bash
npm start        # roda sem watch
npm test         # testes dos services (não precisa de banco)
npm run typecheck
```

## Rotas

Todas sob o prefixo `/api/v1`.

| Método | Rota | Token |
|---|---|---|
| GET | `/saude` | não |
| POST | `/auth/login` | não |
| POST | `/auth/refresh` | não |
| POST | `/auth/logout` | não |
| GET | `/auth/me` | sim |
| GET POST | `/usuarios` | sim |
| GET PATCH | `/usuarios/:id` | sim |
| PATCH | `/usuarios/:id/status` | sim |
| POST | `/usuarios/:id/redefinir-senha` | sim |
| GET POST | `/grupos-permissao` | sim |
| GET PATCH DELETE | `/grupos-permissao/:id` | sim |
| GET PUT | `/grupos-permissao/:id/permissoes` | sim |
| GET | `/permissoes` | sim |

## Autenticação

O login devolve dois tokens:

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "kJ8vQ2mX...",
  "expiraEm": "2026-09-09T16:49:05.000Z",
  "usuario": { "id": "...", "permissoes": ["..."] }
}
```

- **`accessToken`** vai no cabeçalho: `Authorization: Bearer <accessToken>`. Dura 15 minutos.
- **`refreshToken`** vai no corpo de `/auth/refresh` e `/auth/logout`, nunca no cabeçalho. Dura 7 dias e é trocado a cada refresh.

## Postman

Crie um Environment com estas variáveis:

| Variável | Valor inicial |
|---|---|
| `baseUrl` | `http://localhost:3200/api/v1` |
| `accessToken` | deixe vazio |
| `refreshToken` | deixe vazio |

Use `{{baseUrl}}/usuarios` nas URLs.

Para não copiar token na mão, na requisição de login abra a aba **Scripts → Post-response** e cole:

```javascript
const corpo = pm.response.json();
pm.environment.set("accessToken", corpo.accessToken);
pm.environment.set("refreshToken", corpo.refreshToken);
```

Depois, na Collection, aba **Authorization**, escolha o tipo **Bearer Token** e coloque `{{accessToken}}`. Todas as requisições herdam isso.

Quando o access token expirar (401 `TOKEN_EXPIRADO`), chame `POST {{baseUrl}}/auth/refresh` com o corpo abaixo e o mesmo script acima:

```json
{ "refreshToken": "{{refreshToken}}" }
```

## Formato dos erros

```json
{
  "mensagem": "Descrição legível",
  "codigo": "CODIGO_ESTAVEL",
  "campos": { "email": ["Informe o e-mail"] }
}
```

`campos` só aparece em erro de validação (422).

| Status | Quando acontece |
|---|---|
| 401 | sem token, token inválido, expirado ou usuário inativo |
| 403 | autenticado mas sem a permissão da rota |
| 404 | registro ou rota não encontrada |
| 409 | e-mail/nome já em uso, ou `atualizadoEm` desatualizado |
| 422 | corpo ou query inválidos |
| 500 | erro interno (inclui banco indisponível) |

## Estrutura

```
src/
  index.ts          servidor
  router.ts         monta as rotas em /api/v1
  erros.ts          classes de erro da aplicação
  database/         conexão com o Postgres
  routes/           declara método, caminho e middlewares
  controllers/      valida a requisição e monta a resposta
  services/         regra de negócio
  repositories/     SQL
  middlewares/      autenticar, autorizar, tratar erro
tests/              testes dos services
```
