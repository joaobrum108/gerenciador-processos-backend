import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarUsuariosService } from "../src/services/usuarios.service.ts";
import type { ErroAplicacao } from "../src/erros.ts";

const ATOR = {
  usuarioId: "99999999-9999-9999-9999-999999999999",
  ipOrigem: "127.0.0.1",
  permissoes: ["usuarios.acessos.editar", "usuarios.acessos.status"],
};

const ID_USUARIO = "11111111-1111-1111-1111-111111111111";
const ID_GRUPO = "22222222-2222-2222-2222-222222222222";

function usuarioFalso(sobrescritas: Record<string, unknown> = {}) {
  return {
    id: ID_USUARIO,
    funcionarioIxcId: null,
    funcionarioNomeSnapshot: null,
    nomeExibicao: "Joao",
    emailLogin: "joao@redfox.com",
    provedorAuth: "LOCAL",
    ativo: true,
    deveTrocarSenha: false,
    ultimoAcessoEm: null,
    senhaAlteradaEm: null,
    criadoPorUsuarioId: null,
    criadoEm: new Date("2026-01-01T00:00:00Z"),
    atualizadoEm: new Date("2026-01-01T00:00:00Z"),
    ...sobrescritas,
  };
}

function montarService(opcoes: {
  usuario?: ReturnType<typeof usuarioFalso> | null;
  emailJaUsado?: boolean;
  funcionarioJaVinculado?: boolean;
  grupo?: { id: string; nome: string; ativo: boolean } | null;
  atualizacaoRetorna?: ReturnType<typeof usuarioFalso> | null;
} = {}) {
  const usuario =
    opcoes.usuario === undefined ? usuarioFalso() : opcoes.usuario;

  const registros = {
    auditorias: [] as any[],
    sessoesRevogadas: [] as any[],
    gruposSalvos: [] as string[][],
    senhasDefinidas: [] as any[],
    ativoAlterado: [] as boolean[],
  };

  const service = criarUsuariosService({
    rodadasBcrypt: 4,
    emTransacao: (async (operacao: any) => operacao({} as any)) as any,
    usuariosRepository: {
      buscarPorId: async () => usuario,
      buscarGrupos: async () => [],
      buscarGruposDeVarios: async () => new Map(),
      emailJaUsado: async () => opcoes.emailJaUsado ?? false,
      funcionarioJaVinculado: async () => opcoes.funcionarioJaVinculado ?? false,
      criar: async (dados: any) => usuarioFalso(dados),
      atualizar: async () =>
        opcoes.atualizacaoRetorna === undefined
          ? usuarioFalso()
          : opcoes.atualizacaoRetorna,
      alterarAtivo: async (_id: string, ativo: boolean) => {
        registros.ativoAlterado.push(ativo);
        return usuarioFalso({ ativo });
      },
      definirSenha: async (...args: any[]) => {
        registros.senhasDefinidas.push(args);
      },
      substituirGrupos: async (_id: string, grupoIds: string[]) => {
        registros.gruposSalvos.push(grupoIds);
      },
    } as any,
    gruposRepository: {
      buscarPorId: async () =>
        opcoes.grupo === undefined
          ? { id: ID_GRUPO, nome: "Administradores", ativo: true }
          : opcoes.grupo,
    } as any,
    sessoesRepository: {
      revogarTodasDoUsuario: async (usuarioId: string, motivo: string) => {
        registros.sessoesRevogadas.push({ usuarioId, motivo });
        return 1;
      },
    } as any,
    auditoriaRepository: {
      registrar: async (registro: any) => {
        registros.auditorias.push(registro);
      },
    } as any,
  });

  return { service, registros };
}

async function capturarErro(operacao: () => Promise<unknown>) {
  try {
    await operacao();
  } catch (erro) {
    return erro as ErroAplicacao;
  }
  throw new Error("Esperava um erro, mas a operacao teve sucesso");
}

describe("usuarios.service criar", () => {
  it("normaliza o e-mail para minusculas antes de gravar", async () => {
    const { service } = montarService();

    const usuario = await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "  JOAO@RedFox.COM  ",
        senha: "senha-forte-123",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(usuario.emailLogin, "joao@redfox.com");
  });

  it("recusa e-mail ja usado com 409", async () => {
    const { service } = montarService({ emailJaUsado: true });

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          senha: "senha-forte-123",
          provedorAuth: "LOCAL",
          grupoIds: [],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "EMAIL_EM_USO");
  });

  it("exige senha quando o provedor e LOCAL", async () => {
    const { service } = montarService();

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          provedorAuth: "LOCAL",
          grupoIds: [],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 422);
    assert.ok(erro.campos?.senha);
  });

  it("exige funcionarioIxcId e snapshot juntos", async () => {
    const { service } = montarService();

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          senha: "senha-forte-123",
          provedorAuth: "LOCAL",
          funcionarioIxcId: "4321",
          grupoIds: [],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 422);
    assert.ok(erro.campos?.funcionarioIxcId);
  });

  it("recusa vinculo de funcionario ja usado por outro usuario ativo", async () => {
    const { service } = montarService({ funcionarioJaVinculado: true });

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          senha: "senha-forte-123",
          provedorAuth: "LOCAL",
          funcionarioIxcId: "4321",
          funcionarioNomeSnapshot: "Joao Pedro",
          grupoIds: [],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "FUNCIONARIO_JA_VINCULADO");
  });

  it("recusa atribuir grupo inativo", async () => {
    const { service } = montarService({
      grupo: { id: ID_GRUPO, nome: "Antigo", ativo: false },
    });

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          senha: "senha-forte-123",
          provedorAuth: "LOCAL",
          grupoIds: [ID_GRUPO],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, "GRUPO_INATIVO");
  });

  it("recusa grupo inexistente", async () => {
    const { service } = montarService({ grupo: null });

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          senha: "senha-forte-123",
          provedorAuth: "LOCAL",
          grupoIds: [ID_GRUPO],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 422);
  });

  it("registra auditoria da criacao", async () => {
    const { service, registros } = montarService();

    await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        senha: "senha-forte-123",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(registros.auditorias.length, 1);
    assert.equal(registros.auditorias[0].acao, "CRIAR");
    assert.equal(registros.auditorias[0].entidade, "usuarios");
  });
});

describe("usuarios.service atualizar", () => {
  it("responde 409 quando atualizadoEm esta desatualizado", async () => {
    const { service } = montarService({ atualizacaoRetorna: null });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_USUARIO,
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          grupoIds: [],
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR
      )
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "REGISTRO_DESATUALIZADO");
  });

  it("responde 404 quando o usuario nao existe", async () => {
    const { service } = montarService({ usuario: null });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_USUARIO,
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          grupoIds: [],
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR
      )
    );

    assert.equal(erro.status, 404);
  });

  it("substitui os grupos do usuario", async () => {
    const { service, registros } = montarService();

    await service.atualizar(
      ID_USUARIO,
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        grupoIds: [ID_GRUPO],
        atualizadoEm: "2026-01-01T00:00:00.000Z",
      },
      ATOR
    );

    assert.deepEqual(registros.gruposSalvos, [[ID_GRUPO]]);
  });
});

describe("usuarios.service alterarStatus", () => {
  it("revoga todas as sessoes ao bloquear o usuario", async () => {
    const { service, registros } = montarService();

    await service.alterarStatus(ID_USUARIO, false, "Desligamento", ATOR);

    assert.deepEqual(registros.ativoAlterado, [false]);
    assert.equal(registros.sessoesRevogadas.length, 1);
    assert.equal(registros.sessoesRevogadas[0].motivo, "BLOQUEIO_USUARIO");
  });

  it("nao revoga sessoes ao reativar o usuario", async () => {
    const { service, registros } = montarService({
      usuario: usuarioFalso({ ativo: false }),
    });

    await service.alterarStatus(ID_USUARIO, true, null, ATOR);

    assert.deepEqual(registros.ativoAlterado, [true]);
    assert.equal(registros.sessoesRevogadas.length, 0);
  });

  it("impede que o usuario bloqueie a si mesmo", async () => {
    const { service } = montarService();

    const erro = await capturarErro(() =>
      service.alterarStatus(ID_USUARIO, false, null, {
        usuarioId: ID_USUARIO,
        ipOrigem: null,
        permissoes: ATOR.permissoes,
      })
    );

    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, "AUTO_BLOQUEIO");
  });

  it("nao grava nem audita quando o status ja e o desejado", async () => {
    const { service, registros } = montarService();

    await service.alterarStatus(ID_USUARIO, true, null, ATOR);

    assert.equal(registros.ativoAlterado.length, 0);
    assert.equal(registros.auditorias.length, 0);
  });
});

describe("usuarios.service redefinirSenha", () => {
  it("gera senha temporaria, exige troca e derruba as sessoes", async () => {
    const { service, registros } = montarService();

    const resultado = await service.redefinirSenha(ID_USUARIO, ATOR);

    assert.ok(resultado.senhaTemporaria.length >= 8);
    assert.equal(registros.senhasDefinidas.length, 1);
    assert.equal(registros.senhasDefinidas[0][2], true);
    assert.equal(registros.sessoesRevogadas[0].motivo, "TROCA_SENHA");
  });

  it("nao redefine senha de usuario com provedor AD", async () => {
    const { service } = montarService({
      usuario: usuarioFalso({ provedorAuth: "AD" }),
    });

    const erro = await capturarErro(() =>
      service.redefinirSenha(ID_USUARIO, ATOR)
    );

    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, "PROVEDOR_SEM_SENHA_LOCAL");
  });

  it("nao devolve a senha temporaria em hash reversivel nem repete valores", async () => {
    const { service } = montarService();

    const primeira = await service.redefinirSenha(ID_USUARIO, ATOR);
    const segunda = await service.redefinirSenha(ID_USUARIO, ATOR);

    assert.notEqual(primeira.senhaTemporaria, segunda.senhaTemporaria);
  });
});
