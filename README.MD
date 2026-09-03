# Gerenciador de Processos — Backend

API do Gerenciador de Processos RedFox. Escopo atual: autenticação, usuários, grupos de permissão e catálogo de permissões.

Este projeto **não cria tabelas**. O schema do banco pertence ao projeto `api-db-redfox-process`.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL rodando com o banco `redfox_processos` criado e as tabelas já aplicadas pelo projeto `api-db-redfox-process`

## Instalação

```bash
npm install
```

## Configuração

Copie o `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

O `JWT_SECRET` não tem valor padrão e não pode ficar vazio. Gere um:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

A API valida `DATABASE_URL`, `JWT_SECRET` e `PORT` no boot e **se recusa a subir**
se algo estiver faltando ou malformado, listando o que está errado. É de
propósito: um `JWT_SECRET` vazio, antes, só aparecia como erro 500 na primeira
tentativa de login.

| Variável | Exemplo | Para que serve |
|---|---|---|
| `PORT` | `3200` | porta do servidor |
| `DATABASE_URL` | `postgresql://postgres:senha@localhost:5432/redfox_processos` | conexão com o Postgres |
| `JWT_SECRET` | **obrigatória**, mínimo 32 caracteres | assina o access token |
| `JWT_EXPIRACAO` | `15m` | validade do access token |
| `REFRESH_EXPIRACAO_DIAS` | `7` | validade do refresh token |
| `BCRYPT_ROUNDS` | `10` | custo do hash de senha |
| `SMTP_HOST` | `smtp.empresa.com` | servidor SMTP para e-mails de acesso |
| `SMTP_PORT` | `587` | porta SMTP |
| `SMTP_SECURE` | `false` | `true` para TLS direto, normalmente na porta 465 |
| `SMTP_USER` | e-mail/usuário SMTP | autenticação SMTP |
| `SMTP_PASS` | segredo SMTP | autenticação SMTP |
| `SMTP_FROM` | `Gerenciador <nao-responda@empresa.com>` | remetente dos e-mails |
| `FRONTEND_LOGIN_URL` | URL da tela de login | link opcional incluído no e-mail |

## Rodando

```bash
npm run dev
```

Servidor em `http://localhost:3200`. Todas as rotas ficam sob `/api/v1`. Teste rápido:

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
npm test         # testes dos services (não conecta no banco, mas exige o .env)
npm run typecheck
```

## Rotas

Todas sob o prefixo `/api/v1`.

| Método | Rota | Token | Permissão |
|---|---|---|---|
| GET | `/saude` | não | — |
| POST | `/auth/login` | não | — |
| POST | `/auth/refresh` | não | — |
| POST | `/auth/logout` | não | — |
| GET | `/auth/me` | sim | — |
| GET POST | `/usuarios` | sim | `usuarios.acessosSistema.view` |
| GET PATCH | `/usuarios/:id` | sim | `usuarios.acessosSistema.view` |
| PATCH | `/usuarios/:id/status` | sim | `usuarios.acessosSistema.view` |
| POST | `/usuarios/:id/redefinir-senha` | sim | `usuarios.acessosSistema.view` |
| GET | `/grupos-permissao` | sim | `usuarios.grupos.view` |
| POST | `/grupos-permissao` | sim | `usuarios.grupos.criar` |
| GET | `/grupos-permissao/:id` | sim | `usuarios.grupos.view` |
| PATCH | `/grupos-permissao/:id` | sim | `usuarios.grupos.editar` |
| DELETE | `/grupos-permissao/:id` | sim | `usuarios.grupos.inativar` |
| GET | `/grupos-permissao/:id/permissoes` | sim | `usuarios.permissoes.view` |
| PUT | `/grupos-permissao/:id/permissoes` | sim | `usuarios.permissoes.editar` |
| GET | `/permissoes` | sim | `usuarios.permissoes.view` ou `usuarios.grupos.view` |

Toda a administração de acessos usa a mesma permissão: quem enxerga a tela de
acessos ao sistema opera nela por inteiro.

## Usuários

Além de `nomeExibicao` e `emailLogin`, o `POST` e o `PATCH` aceitam:

| Campo | Valores | Padrão na criação |
|---|---|---|
| `cargo` | texto até 100 caracteres | `Não informado` |
| `escala` | `5x2`, `6x1`, `12x36` | `5x2` |
| `status` | `ATIVO`, `INATIVO`, `CONVITE_PENDENTE` (só no `POST`) | `ATIVO` |

`status` e `ativo` são a mesma noção de estado e são gravados juntos: bloquear
pelo `PATCH /usuarios/:id/status` grava `ativo=false` e `status=INATIVO`. Login
só é aceito com os dois concordando em `ATIVO`.

Omitir `cargo` ou `escala` no `PATCH` preserva o que já estava gravado.

### Senha do usuário novo

Usuários `LOCAL` recebem uma senha temporária aleatória e `deveTrocarSenha=true`.
O destino dela depende do SMTP:

- **SMTP configurado** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`): a
  senha vai por e-mail e **não** aparece na resposta. Falha no envio devolve
  `502 EMAIL_NAO_ENVIADO` com o usuário já criado.
- **SMTP não configurado**: a resposta `201` inclui `senhaTemporaria`. É a única
  forma de a senha chegar a alguém — ela não fica gravada em lugar nenhum.

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
