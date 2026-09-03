# Guia de integração do frontend

## Checklist que o frontend deve conferir

- Existe um `.env` local, fora do Git, com a URL da API.
- Existe um cliente central, por exemplo `src/services/api.ts`.
- Nenhuma tela concatena a URL do backend manualmente.
- O access token é enviado como `Authorization: Bearer <token>`.
- Ao receber `401` com `codigo: "TOKEN_EXPIRADO"`, há no máximo uma tentativa de renovação.
- A renovação substitui **os dois tokens**, pois o refresh token é rotacionado.
- O logout envia o refresh token no corpo e limpa a sessão local mesmo se a chamada falhar.
- A navegação e os botões são controlados por `usuario.permissoes`.
- Listagens leem `resposta.dados`, e não assumem que a resposta seja um array.
- Datas ISO são mantidas como string no estado e formatadas apenas para exibição.
- `204 No Content` não é interpretado com `response.json()`.
- Erros `422` exibem `campos`; `409` solicita recarga quando o código for `REGISTRO_DESATUALIZADO`.

## `.env` do frontend

Para Vite/Vue, crie `.env.development.local`:

```dotenv
VITE_API_URL=http://localhost:3200/api/v1
```

Não copie `DATABASE_URL`, `JWT_SECRET` ou qualquer configuração do backend para o frontend. Toda variável prefixada por `VITE_` é incorporada ao bundle e deve ser considerada pública.

Se o projeto não usar Vite, adapte somente o nome da variável ao mecanismo do framework. O valor continua sendo a URL-base pública da API.

## Proxy de desenvolvimento

O backend já configura CORS, então o proxy é opcional. Ele continua útil para evitar preflight em desenvolvimento:

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3200",
        changeOrigin: true,
      },
    },
  },
});
```

Com o proxy, use `VITE_API_URL=/api/v1`. O proxy é apenas para desenvolvimento; produção precisa de mesma origem, reverse proxy ou o CORS do backend restrito à origem real.

## Contrato sugerido para `src/services/api.ts`

O backend já possui `axios` como dependência, mas isso não obriga o frontend a usá-lo. Um cliente Axios pode seguir este formato:

```ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export interface ErroApi {
  mensagem: string;
  codigo: string;
  campos?: Record<string, string[]>;
}

export interface SessaoApi {
  accessToken: string;
  refreshToken: string;
}

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error("VITE_API_URL não definida");
}

export const api = axios.create({ baseURL });

// Substitua estas funções pela store de autenticação real do frontend.
const lerSessao = (): SessaoApi | null => null;
const salvarSessao = (_sessao: SessaoApi): void => undefined;
const limparSessao = (): void => undefined;

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = lerSessao()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let renovacaoEmAndamento: Promise<string> | null = null;

api.interceptors.response.use(undefined, async (erro: AxiosError<ErroApi>) => {
  const requisicao = erro.config as (InternalAxiosRequestConfig & { _repetida?: boolean }) | undefined;
  const sessao = lerSessao();
  const expirou = erro.response?.status === 401 && erro.response.data?.codigo === "TOKEN_EXPIRADO";

  if (!requisicao || requisicao._repetida || !sessao || !expirou) {
    return Promise.reject(erro);
  }

  requisicao._repetida = true;

  renovacaoEmAndamento ??= axios
    .post(`${baseURL}/auth/refresh`, { refreshToken: sessao.refreshToken })
    .then(({ data }) => {
      salvarSessao({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken as string;
    })
    .catch((falha) => {
      limparSessao();
      throw falha;
    })
    .finally(() => {
      renovacaoEmAndamento = null;
    });

  requisicao.headers.Authorization = `Bearer ${await renovacaoEmAndamento}`;
  return api(requisicao);
});
```

O exemplo evita várias renovações simultâneas e repete uma requisição apenas uma vez. A store concreta deve implementar `lerSessao`, `salvarSessao` e `limparSessao`.

## Tipos compartilhados mínimos

```ts
export interface GrupoResumo {
  id: string;
  nome: string;
}

export interface UsuarioAutenticado {
  id: string;
  nomeExibicao: string;
  emailLogin: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  deveTrocarSenha: boolean;
  ultimoAcessoEm: string | null;
  grupos: GrupoResumo[];
  permissoes: string[];
}

export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  expiraEm: string;
  usuario: UsuarioAutenticado;
}

export interface RespostaPaginada<T> {
  dados: T[];
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}
```

Observação: `expiraEm` no login é a expiração do **refresh token**. A expiração do access token está no JWT e é configurada separadamente no backend.

## Fluxo de autenticação

1. Fazer `POST /auth/login` com e-mail e senha.
2. Guardar `accessToken`, `refreshToken` e `usuario`.
3. Enviar o access token nas rotas privadas.
4. Restaurar os dados do usuário com `GET /auth/me` ao iniciar o app.
5. Renovar somente em `401 TOKEN_EXPIRADO`.
6. Substituir os dois tokens retornados pelo refresh.
7. Em refresh inválido/expirado ou usuário inativo, limpar a sessão e voltar ao login.
8. No logout, enviar `{ refreshToken }`; a resposta correta é `204` sem corpo.

O backend atual usa tokens no corpo JSON, não cookies. A decisão de armazenamento no navegador pertence ao frontend; evite expor tokens em URL, logs ou mensagens.

## Permissões e rotas de tela

Use as permissões retornadas no login e em `/auth/me`. As permissões exigidas atualmente são:

| Área/ação | Permissão |
|---|---|
| Ver, criar, editar, alterar status e redefinir senha de usuários | `usuarios.acessosSistema.view` |
| Ver grupos | `usuarios.grupos.view` |
| Criar grupo | `usuarios.grupos.criar` |
| Editar grupo | `usuarios.grupos.editar` |
| Inativar grupo | `usuarios.grupos.inativar` |
| Ver permissões | `usuarios.permissoes.view` ou, somente no catálogo, `usuarios.grupos.view` |
| Editar permissões | `usuarios.permissoes.editar` |

Ocultar um botão melhora a experiência, mas não substitui a autorização no backend.

