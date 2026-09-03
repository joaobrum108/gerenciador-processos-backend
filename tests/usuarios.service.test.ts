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
    cargo: "Tecnico",
    status: "ATIVO",
    escala: "5x2",
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
  smtpConfigurado?: boolean;
  gruposDoUsuario?: { id: string; nome: string; ativo: boolean }[];
} = {}) {
  const usuario =
    opcoes.usuario === undefined ? usuarioFalso() : opcoes.usuario;

  const registros = {
    auditorias: [] as any[],
    sessoesRevogadas: [] as any[],
    gruposSalvos: [] as string[][],
    senhasDefinidas: [] as any[],
    ativoAlterado: [] as boolean[],
    emailsEnviados: [] as any[],
    usuariosCriados: [] as any[],
  };

  const service = criarUsuariosService({
    rodadasBcrypt: 4,
    emTransacao: (async (operacao: any) => operacao({} as any)) as any,
    usuariosRepository: {
      buscarPorId: async () => usuario,
      buscarGrupos: async () => opcoes.gruposDoUsuario ?? [],
      buscarGruposDeVarios: async () => new Map(),
      emailJaUsado: async () => opcoes.emailJaUsado ?? false,
      funcionarioJaVinculado: async () => opcoes.funcionarioJaVinculado ?? false,
      criar: async (dados: any) => {
        registros.usuariosCriados.push(dados);
        return usuarioFalso(dados);
      },
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
    emailService: {
      configurado: () => opcoes.smtpConfigurado ?? true,
      enviarCredenciaisNovoUsuario: async (credenciais: any) => {
        registros.emailsEnviados.push(credenciais);
      },
    },
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
          provedorAuth: "LOCAL",
          grupoIds: [],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "EMAIL_EM_USO");
  });

  it("gera e envia uma senha temporaria para usuario LOCAL", async () => {
    const { service, registros } = montarService();

    await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(registros.emailsEnviados.length, 1);
    assert.equal(registros.emailsEnviados[0].email, "joao@redfox.com");
    assert.ok(registros.emailsEnviados[0].senhaTemporaria.length >= 16);
  });

  it("nao devolve a senha na resposta quando o e-mail foi enviado", async () => {
    const { service } = montarService({ smtpConfigurado: true });

    const criado = await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(criado.senhaTemporaria, undefined);
  });

  it("devolve a senha temporaria na resposta quando nao ha SMTP configurado", async () => {
    const { service, registros } = montarService({ smtpConfigurado: false });

    const criado = await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(registros.emailsEnviados.length, 0);
    assert.ok((criado.senhaTemporaria ?? "").length >= 16);
  });

  it("nao gera senha nem devolve nada para provedor nao LOCAL", async () => {
    const { service, registros } = montarService({ smtpConfigurado: false });

    const criado = await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        provedorAuth: "AD",
        grupoIds: [],
      },
      ATOR
    );

    assert.equal(registros.emailsEnviados.length, 0);
    assert.equal(criado.senhaTemporaria, undefined);
  });

  it("aplica cargo, escala e status padrao quando omitidos", async () => {
    const { service, registros } = montarService();

    await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    const gravado = registros.usuariosCriados[0];
    assert.equal(gravado.cargo, "Não informado");
    assert.equal(gravado.escala, "5x2");
    assert.equal(gravado.status, "ATIVO");
  });

  it("grava cargo, escala e status informados", async () => {
    const { service, registros } = montarService();

    await service.criar(
      {
        nomeExibicao: "Joao",
        emailLogin: "joao@redfox.com",
        cargo: "  Tecnico de Campo  ",
        escala: "12x36",
        status: "CONVITE_PENDENTE",
        provedorAuth: "LOCAL",
        grupoIds: [],
      },
      ATOR
    );

    const gravado = registros.usuariosCriados[0];
    assert.equal(gravado.cargo, "Tecnico de Campo");
    assert.equal(gravado.escala, "12x36");
    assert.equal(gravado.status, "CONVITE_PENDENTE");
  });

  it("exige funcionarioIxcId e snapshot juntos", async () => {
    const { service } = montarService();

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
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

describe("usuarios.service protecao do administrador master", () => {
  const GRUPO_MASTER = {
    id: "33333333-3333-3333-3333-333333333333",
    nome: "Administrador Master",
    ativo: true,
  };

  it("trata o usuario master como inexistente em buscarPorId", async () => {
    const { service } = montarService({ gruposDoUsuario: [GRUPO_MASTER] });

    const erro = await capturarErro(() => service.buscarPorId(ID_USUARIO));

    assert.equal(erro.status, 404);
    assert.equal(erro.codigo, "NAO_ENCONTRADO");
  });

  it("recusa alterar o status do usuario master", async () => {
    const { service } = montarService({ gruposDoUsuario: [GRUPO_MASTER] });

    const erro = await capturarErro(() =>
      service.alterarStatus(ID_USUARIO, false, null, ATOR)
    );

    assert.equal(erro.status, 404);
  });

  it("recusa redefinir a senha do usuario master", async () => {
    const { service } = montarService({ gruposDoUsuario: [GRUPO_MASTER] });

    const erro = await capturarErro(() =>
      service.redefinirSenha(ID_USUARIO, ATOR)
    );

    assert.equal(erro.status, 404);
  });

  it("recusa atribuir o grupo master a um usuario novo", async () => {
    const { service } = montarService({ grupo: GRUPO_MASTER });

    const erro = await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          provedorAuth: "LOCAL",
          grupoIds: [GRUPO_MASTER.id],
        },
        ATOR
      )
    );

    assert.equal(erro.status, 422);
    assert.equal(erro.codigo, "DADOS_INVALIDOS");
  });

  it("nao registra o usuario quando o grupo master e recusado", async () => {
    const { service, registros } = montarService({ grupo: GRUPO_MASTER });

    await capturarErro(() =>
      service.criar(
        {
          nomeExibicao: "Joao",
          emailLogin: "joao@redfox.com",
          provedorAuth: "LOCAL",
          grupoIds: [GRUPO_MASTER.id],
        },
        ATOR
      )
    );

    assert.equal(registros.usuariosCriados.length, 0);
  });
});
