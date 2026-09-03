import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  criarAuthService,
  gerarHashRefreshToken,
} from "../src/services/auth.service.ts";
import { ErroAplicacao } from "../src/erros.ts";

const CONFIGURACAO = {
  segredoJwt: "segredo-de-teste",
  expiracaoJwt: "15m",
  diasExpiracaoRefresh: 7,
};

const CONTEXTO = { ipOrigem: "127.0.0.1", userAgent: "teste" };

function usuarioFalso(sobrescritas: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    funcionarioIxcId: null,
    funcionarioNomeSnapshot: null,
    nomeExibicao: "Joao",
    emailLogin: "joao@redfox.com",
    cargo: "Tecnico",
    status: "ATIVO",
    escala: "5x2",
    senhaHash: bcrypt.hashSync("senha-correta", 4),
    provedorAuth: "LOCAL",
    ativo: true,
    deveTrocarSenha: false,
    ultimoAcessoEm: null,
    senhaAlteradaEm: null,
    criadoPorUsuarioId: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...sobrescritas,
  };
}

function repositoriosFalsos(usuario: ReturnType<typeof usuarioFalso> | null) {
  const sessoes: Record<string, any> = {};
  const chamadas = { acessosRegistrados: 0, senhasDefinidas: [] as any[] };

  return {
    chamadas,
    sessoes,
    usuariosRepository: {
      buscarPorEmailLogin: async () => usuario,
      buscarPorId: async () => usuario,
      buscarComSenhaPorId: async () => usuario,
      definirSenha: async (...args: any[]) => {
        chamadas.senhasDefinidas.push(args);
      },
      buscarGrupos: async () => [
        { id: "g1", nome: "Administradores", ativo: true },
        { id: "g2", nome: "Grupo Inativo", ativo: false },
      ],
      buscarPermissoes: async () => ["usuarios.acessos.view"],
      registrarAcesso: async () => {
        chamadas.acessosRegistrados += 1;
      },
    } as any,
    sessoesRepository: {
      criar: async (dados: any) => {
        const registro = {
          id: `sessao-${Object.keys(sessoes).length + 1}`,
          usuarioId: dados.usuarioId,
          expiraEm: dados.expiraEm,
          revogadoEm: null,
          motivoRevogacao: null,
          substituidaPorSessaoId: null,
          ultimoUsoEm: null,
          criadoEm: new Date(),
        };
        sessoes[dados.refreshTokenHash] = registro;
        return registro;
      },
      buscarPorHash: async (hash: string) => sessoes[hash] ?? null,
      revogar: async (id: string, motivo: string) => {
        for (const registro of Object.values(sessoes)) {
          if (registro.id === id) {
            registro.revogadoEm = new Date();
            registro.motivoRevogacao = motivo;
          }
        }
      },
      revogarTodasDoUsuario: async (usuarioId: string, motivo: string) => {
        let total = 0;
        for (const registro of Object.values(sessoes)) {
          if (registro.usuarioId === usuarioId && !registro.revogadoEm) {
            registro.revogadoEm = new Date();
            registro.motivoRevogacao = motivo;
            total += 1;
          }
        }
        return total;
      },
      registrarUso: async () => {},
    } as any,
  };
}

async function capturarErro(operacao: () => Promise<unknown>) {
  try {
    await operacao();
  } catch (erro) {
    return erro as ErroAplicacao;
  }
  throw new Error("Esperava um erro, mas a operacao teve sucesso");
}

describe("auth.service login", () => {
  it("autentica com senha correta e devolve tokens e permissoes", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const resultado = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );

    assert.ok(resultado.accessToken.length > 0);
    assert.ok(resultado.refreshToken.length > 0);
    assert.equal(resultado.usuario.emailLogin, "joao@redfox.com");
    assert.deepEqual(resultado.usuario.permissoes, ["usuarios.acessos.view"]);
    assert.equal(falsos.chamadas.acessosRegistrados, 1);
  });

  it("expoe somente grupos ativos do usuario", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const resultado = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );

    assert.deepEqual(resultado.usuario.grupos, [
      { id: "g1", nome: "Administradores" },
    ]);
  });

  it("recusa senha incorreta com 401 e sem revelar o motivo", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("joao@redfox.com", "senha-errada", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.message, "E-mail ou senha invalidos");
  });

  it("recusa e-mail inexistente com a mesma mensagem da senha errada", async () => {
    const falsos = repositoriosFalsos(null);
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("ninguem@redfox.com", "qualquer", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.message, "E-mail ou senha invalidos");
  });

  it("recusa status INATIVO mesmo com ativo=true", async () => {
    const falsos = repositoriosFalsos(
      usuarioFalso({ ativo: true, status: "INATIVO" })
    );
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("joao@redfox.com", "senha-correta", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "USUARIO_INATIVO");
  });

  it("recusa status CONVITE_PENDENTE mesmo com ativo=true", async () => {
    const falsos = repositoriosFalsos(
      usuarioFalso({ ativo: true, status: "CONVITE_PENDENTE" })
    );
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("joao@redfox.com", "senha-correta", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "USUARIO_INATIVO");
  });

  it("recusa usuario inativo mesmo com a senha correta", async () => {
    const falsos = repositoriosFalsos(usuarioFalso({ ativo: false }));
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("joao@redfox.com", "senha-correta", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "USUARIO_INATIVO");
  });

  it("nao emite sessao para provedor diferente de LOCAL", async () => {
    const falsos = repositoriosFalsos(
      usuarioFalso({ provedorAuth: "AD", senhaHash: null })
    );
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.login("joao@redfox.com", "senha-correta", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(Object.keys(falsos.sessoes).length, 0);
  });

  it("guarda apenas o hash do refresh token, nunca o valor", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const resultado = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );

    const chaves = Object.keys(falsos.sessoes);
    assert.equal(chaves.length, 1);
    assert.ok(!chaves.includes(resultado.refreshToken));
    assert.equal(chaves[0], gerarHashRefreshToken(resultado.refreshToken));
  });
});

describe("auth.service renovar", () => {
  it("rotaciona o refresh token e invalida o anterior", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    const renovado = await service.renovar(login.refreshToken, CONTEXTO);

    assert.notEqual(renovado.refreshToken, login.refreshToken);

    const anterior = falsos.sessoes[gerarHashRefreshToken(login.refreshToken)];
    assert.equal(anterior.motivoRevogacao, "ROTACAO");
    assert.ok(anterior.revogadoEm);
  });

  it("recusa refresh token desconhecido", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.renovar("token-inventado", CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "REFRESH_INVALIDO");
  });

  it("recusa refresh token expirado", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({
      ...falsos,
      configuracao: { ...CONFIGURACAO, diasExpiracaoRefresh: -1 },
    });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    const erro = await capturarErro(() =>
      service.renovar(login.refreshToken, CONTEXTO)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "REFRESH_EXPIRADO");
  });

  it("detecta reuso de token rotacionado e derruba todas as sessoes", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    const renovado = await service.renovar(login.refreshToken, CONTEXTO);

    const erro = await capturarErro(() =>
      service.renovar(login.refreshToken, CONTEXTO)
    );

    assert.equal(erro.status, 401);

    const sessaoAtiva =
      falsos.sessoes[gerarHashRefreshToken(renovado.refreshToken)];
    assert.ok(
      sessaoAtiva.revogadoEm,
      "a sessao valida deveria ter sido revogada apos o reuso"
    );
  });
});

describe("auth.service sair", () => {
  it("revoga a sessao do refresh token informado", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    await service.sair(login.refreshToken);

    const sessao = falsos.sessoes[gerarHashRefreshToken(login.refreshToken)];
    assert.equal(sessao.motivoRevogacao, "LOGOUT");

    const erro = await capturarErro(() =>
      service.renovar(login.refreshToken, CONTEXTO)
    );
    assert.equal(erro.status, 401);
  });

  it("nao falha quando o refresh token nao existe", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    await service.sair("token-inexistente");
  });
});

describe("auth.service resolverUsuarioDoAccessToken", () => {
  it("resolve o usuario a partir de um access token valido", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    const usuario = await service.resolverUsuarioDoAccessToken(
      login.accessToken
    );

    assert.equal(usuario.emailLogin, "joao@redfox.com");
  });

  it("recusa token assinado com outro segredo", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const emissor = criarAuthService({
      ...falsos,
      configuracao: { ...CONFIGURACAO, segredoJwt: "outro-segredo" },
    });
    const verificador = criarAuthService({
      ...falsos,
      configuracao: CONFIGURACAO,
    });

    const login = await emissor.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    const erro = await capturarErro(() =>
      verificador.resolverUsuarioDoAccessToken(login.accessToken)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "TOKEN_INVALIDO");
  });

  it("recusa access token de usuario que foi inativado depois da emissao", async () => {
    const usuario = usuarioFalso();
    const falsos = repositoriosFalsos(usuario);
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const login = await service.login(
      "joao@redfox.com",
      "senha-correta",
      CONTEXTO
    );
    usuario.ativo = false;

    const erro = await capturarErro(() =>
      service.resolverUsuarioDoAccessToken(login.accessToken)
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "USUARIO_INATIVO");
  });
});

describe("auth.service trocarSenha", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  it("recusa quando a senha atual esta errada", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.trocarSenha(ID, "senha-errada", "NovaSenha@2026")
    );

    assert.equal(erro.status, 401);
    assert.equal(erro.codigo, "SENHA_INCORRETA");
    assert.equal(falsos.chamadas.senhasDefinidas.length, 0);
  });

  it("recusa repetir a senha atual", async () => {
    const falsos = repositoriosFalsos(usuarioFalso());
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.trocarSenha(ID, "senha-correta", "senha-correta")
    );

    assert.equal(erro.codigo, "SENHA_REPETIDA");
    assert.equal(falsos.chamadas.senhasDefinidas.length, 0);
  });

  it("recusa usuario com provedor AD", async () => {
    const falsos = repositoriosFalsos(
      usuarioFalso({ provedorAuth: "AD", senhaHash: null })
    );
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.trocarSenha(ID, "senha-correta", "NovaSenha@2026")
    );

    assert.equal(erro.codigo, "PROVEDOR_SEM_SENHA_LOCAL");
  });

  it("recusa usuario inativo", async () => {
    const falsos = repositoriosFalsos(usuarioFalso({ ativo: false }));
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    const erro = await capturarErro(() =>
      service.trocarSenha(ID, "senha-correta", "NovaSenha@2026")
    );

    assert.equal(erro.codigo, "USUARIO_INATIVO");
  });

  it("grava a senha nova, tira a troca obrigatoria e derruba as sessoes", async () => {
    const falsos = repositoriosFalsos(usuarioFalso({ deveTrocarSenha: true }));
    const service = criarAuthService({ ...falsos, configuracao: CONFIGURACAO });

    await service.trocarSenha(ID, "senha-correta", "NovaSenha@2026");

    assert.equal(falsos.chamadas.senhasDefinidas.length, 1);
    const [id, hash, deveTrocar] = falsos.chamadas.senhasDefinidas[0];
    assert.equal(id, ID);
    assert.equal(deveTrocar, false);
    assert.notEqual(hash, "NovaSenha@2026");
    assert.ok(await bcrypt.compare("NovaSenha@2026", hash));
  });
});
