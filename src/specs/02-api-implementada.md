# API implementada atualmente

Este documento foi extraído das rotas, controllers e services existentes em 02/09/2026. Ele não inclui rotas apenas planejadas.

## URL-base real

```text
http://localhost:<PORT>/api/v1
```

Com o `.env.example`, a URL é `http://localhost:3200/api/v1`.

## Variáveis do backend

| Variável | Obrigatória | Padrão no código | Uso |
|---|---:|---|---|
| `PORT` | Não | `3200` | Porta HTTP |
| `DATABASE_URL` | Sim | nenhum | Conexão PostgreSQL |
| `JWT_SECRET` | Sim, validada no boot | nenhum | Assinatura e validação do access token; mínimo 32 caracteres |
| `JWT_EXPIRACAO` | Não | `15m` | Duração do access token |
| `REFRESH_EXPIRACAO_DIAS` | Não | `7` | Duração e renovação do refresh token |
| `BCRYPT_ROUNDS` | Não | `10` | Custo do hash de senha |
| `SMTP_HOST` | Não | nenhum | Servidor SMTP; sem ele a senha temporária volta na resposta |
| `SMTP_PORT` | Não | `587` | Porta SMTP |
| `SMTP_SECURE` | Não | `false` | TLS direto; geralmente `true` na porta 465 |
| `SMTP_USER` | Não | nenhum | Usuário SMTP |
| `SMTP_PASS` | Não | nenhum | Senha SMTP |
| `SMTP_FROM` | Não | nenhum | Remetente da mensagem |
| `FRONTEND_LOGIN_URL` | Não | nenhum | Link de login incluído no e-mail |

Essas variáveis são privadas do servidor. O frontend precisa somente da própria URL pública da API.

## Padrões

Rotas privadas recebem:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Listagens usam `pagina` (padrão 1), `porPagina` (padrão 25, máximo 100), `ordenarPor` e `ordem=asc|desc`.

```ts
interface RespostaPaginada<T> {
  dados: T[];
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}
```

O formato de erro pretendido pelos middlewares é:

```json
{
  "mensagem": "Descrição legível",
  "codigo": "CODIGO_ESTAVEL",
  "campos": { "campo": ["Motivo"] }
}
```

`campos` existe somente quando aplicável. O middleware que garante esse formato está registrado: nenhuma resposta de erro volta em HTML.

## Saúde

### `GET /saude`

Pública. Resposta `200`:

```json
{ "status": "ok" }
```

Ela verifica o processo HTTP, não executa consulta de saúde no banco.

## Autenticação

### `POST /auth/login`

Pública.

```json
{ "email": "usuario@empresa.com", "senha": "senha" }
```

`email` aceita até 254 caracteres; ambos são obrigatórios. Resposta `200`:

```json
{
  "accessToken": "jwt",
  "refreshToken": "token-opaco",
  "expiraEm": "2026-09-09T12:00:00.000Z",
  "usuario": {
    "id": "uuid",
    "nomeExibicao": "Nome",
    "emailLogin": "usuario@empresa.com",
    "funcionarioIxcId": null,
    "funcionarioNomeSnapshot": null,
    "deveTrocarSenha": false,
    "ultimoAcessoEm": null,
    "grupos": [{ "id": "uuid", "nome": "Administradores" }],
    "permissoes": ["usuarios.acessosSistema.view"]
  }
}
```

`expiraEm` representa a validade do refresh token. Possíveis códigos: `NAO_AUTENTICADO`, `USUARIO_INATIVO`, `DADOS_INVALIDOS`.

### `POST /auth/refresh`

Pública; recebe `{ "refreshToken": "..." }`. Retorna `200` com o mesmo contrato do login e rotaciona o refresh token. O token anterior não pode ser reutilizado.

Possíveis códigos: `REFRESH_INVALIDO`, `REFRESH_EXPIRADO`, `USUARIO_INATIVO`, `DADOS_INVALIDOS`.

### `POST /auth/logout`

Pública; recebe `{ "refreshToken": "..." }`. Retorna `204` sem corpo. É idempotente quando o token não existe ou já foi revogado.

### `GET /auth/me`

Privada. Retorna `200` com o objeto `usuario` mostrado no login, sem os tokens.

Possíveis códigos de autenticação: `TOKEN_AUSENTE`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`, `USUARIO_INATIVO`.

## Usuários

```ts
interface Usuario {
  id: string;
  nomeExibicao: string;
  emailLogin: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  cargo: string;
  status: "ATIVO" | "INATIVO" | "CONVITE_PENDENTE";
  escala: "5x2" | "6x1" | "12x36";
  provedorAuth: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  grupos: { id: string; nome: string }[];
}
```

### `GET /usuarios`

Filtros: `busca?`, `ativo=true|false`, `grupoId=<uuid>`, `pagina`, `porPagina`, `ordenarPor=nomeExibicao|emailLogin|criadoEm|ultimoAcessoEm|ativo`, `ordem=asc|desc`.

Retorna `200` com `RespostaPaginada<Usuario>`. Exige `usuarios.acessosSistema.view`.

### `POST /usuarios`

Privada. Permissão `usuarios.acessosSistema.view`.

```json
{
  "nomeExibicao": "Nome",
  "emailLogin": "usuario@empresa.com",
  "provedorAuth": "LOCAL",
  "funcionarioIxcId": "123",
  "funcionarioNomeSnapshot": "Nome no IXC",
  "grupoIds": ["uuid"]
}
```

`provedorAuth` aceita `LOCAL`, `AD` ou `SSO` e assume `LOCAL`. `cargo`, `escala` e `status` são opcionais e assumem `Não informado`, `5x2` e `ATIVO`. Criar com `status` diferente de `ATIVO` grava `ativo=false`. O frontend não envia senha. Os dois campos de funcionário devem ser enviados juntos ou ambos omitidos. Resposta `201` com `Usuario`.

Para `LOCAL`, o backend gera uma senha temporária aleatória, salva somente seu hash e marca a troca obrigatória. O que acontece com a senha depende do SMTP:

- **SMTP configurado:** envia por e-mail ao `emailLogin` e a resposta **não** traz a senha. Se o envio falhar, a resposta é `502 EMAIL_NAO_ENVIADO` com o cadastro já gravado — use o fluxo de redefinição, não tente criar de novo com o mesmo e-mail.
- **SMTP não configurado:** a resposta `201` inclui `senhaTemporaria: string`. Exiba-a uma única vez; ela não fica gravada em lugar nenhum.

### `GET /usuarios/:id`

Privada. Permissão `usuarios.acessosSistema.view`. `id` é UUID. Retorna `200` com `Usuario`.

### `PATCH /usuarios/:id`

Privada. Permissão `usuarios.acessosSistema.view`.

```json
{
  "nomeExibicao": "Nome",
  "emailLogin": "usuario@empresa.com",
  "funcionarioIxcId": "123",
  "funcionarioNomeSnapshot": "Nome no IXC",
  "cargo": "Supervisor",
  "escala": "6x1",
  "grupoIds": ["uuid"],
  "atualizadoEm": "2026-09-02T12:00:00.000Z"
}
```

Todos os campos exibidos são obrigatórios, exceto `cargo`, `escala` e os dois campos IXC. Omitir `cargo` ou `escala` preserva o valor gravado; os campos IXC devem ser enviados juntos ou omitidos. `atualizadoEm` deve ser copiado do último `GET`; conflito retorna `409 REGISTRO_DESATUALIZADO`. Resposta `200` com `Usuario`.

### `PATCH /usuarios/:id/status`

Privada. Permissão `usuarios.acessosSistema.view`.

```json
{ "ativo": false, "motivo": "Opcional, até 500 caracteres" }
```

Retorna `200` com `Usuario`. O usuário não pode bloquear a si próprio (`AUTO_BLOQUEIO`). Bloquear revoga todas as sessões do alvo e grava `status=INATIVO` junto de `ativo=false`.

### `POST /usuarios/:id/redefinir-senha`

Privada. Permissão `usuarios.acessosSistema.view`. Não recebe corpo obrigatório. Retorna `200`:

```json
{ "senhaTemporaria": "valor-exibido-uma-vez" }
```

Somente usuários `LOCAL`. A operação marca troca obrigatória e revoga as sessões do usuário.

Erros de negócio relevantes: `EMAIL_EM_USO`, `EMAIL_NAO_ENVIADO`, `FUNCIONARIO_JA_VINCULADO`, `GRUPO_INATIVO`, `AUTO_BLOQUEIO`, `PROVEDOR_SEM_SENHA_LOCAL`, `REGISTRO_DESATUALIZADO`, `DADOS_INVALIDOS`, `NAO_ENCONTRADO`.

## Grupos de permissão

Todas as rotas desta seção são privadas.

```ts
interface GrupoPermissao {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  totalUsuarios?: number;
  criadoEm: string;
  atualizadoEm: string;
}
```

### `GET /grupos-permissao`

Permissão `usuarios.grupos.view`. Filtros: `busca?`, `ativo=true|false`, paginação, `ordenarPor=nome|criadoEm|ativo` e `ordem`. Retorna `RespostaPaginada<GrupoPermissao>`; itens incluem `totalUsuarios`.

### `POST /grupos-permissao`

Permissão `usuarios.grupos.criar`. Recebe `{ "nome": "...", "descricao": "opcional" }`; nome até 80 e descrição até 255 caracteres. Retorna `201` com o grupo.

### `GET /grupos-permissao/:id`

Permissão `usuarios.grupos.view`. Retorna `200` com o grupo e `totalUsuarios`.

### `PATCH /grupos-permissao/:id`

Permissão `usuarios.grupos.editar`; mudar `ativo` também exige `usuarios.grupos.inativar`.

```json
{
  "nome": "Nome",
  "descricao": "Opcional",
  "ativo": true,
  "atualizadoEm": "2026-09-02T12:00:00.000Z"
}
```

Retorna `200`. Use o `atualizadoEm` recebido anteriormente.

### `DELETE /grupos-permissao/:id`

Permissão `usuarios.grupos.inativar`. Aceita corpo opcional `{ "motivo": "..." }` e retorna `204`. É uma inativação lógica, não exclusão física. Um grupo com usuários retorna `400 GRUPO_COM_USUARIOS`.

### `GET /grupos-permissao/:id/permissoes`

Permissão `usuarios.permissoes.view`. Retorna:

```json
{ "permissaoIds": ["usuarios.acessosSistema.view"] }
```

### `PUT /grupos-permissao/:id/permissoes`

Permissão `usuarios.permissoes.editar`. Substitui o conjunto inteiro, de forma atômica:

```json
{ "permissaoIds": ["usuarios.acessosSistema.view", "usuarios.grupos.view"] }
```

Retorna `200` no mesmo formato. Enviar array vazio remove todas as permissões.

Erros relevantes: `NOME_EM_USO`, `GRUPO_COM_USUARIOS`, `REGISTRO_DESATUALIZADO`, `PERMISSAO_NEGADA`, `DADOS_INVALIDOS`, `NAO_ENCONTRADO`.

## Catálogo de permissões

### `GET /permissoes`

Privada. Aceita quem possuir `usuarios.permissoes.view` **ou** `usuarios.grupos.view`. Resposta `200`:

```json
{
  "modulos": [
    {
      "modulo": "Usuários e Permissões",
      "permissoes": [
        {
          "id": "usuarios.acessosSistema.view",
          "nome": "Acessos ao Sistema",
          "descricao": null
        }
      ]
    }
  ]
}
```

Os IDs vêm do banco; o frontend não deve manter uma lista paralela como fonte da verdade.

## Status HTTP usados

| Status | Significado no contrato |
|---:|---|
| `200` | Consulta ou alteração concluída |
| `201` | Recurso criado |
| `204` | Sucesso sem corpo |
| `400` | Regra de negócio |
| `401` | Falha de autenticação/token |
| `403` | Usuário sem permissão |
| `404` | Recurso ou rota não encontrado |
| `409` | Duplicidade ou concorrência otimista |
| `422` | Corpo, query ou parâmetro inválido |
| `500` | Erro não tratado/infraestrutura |
