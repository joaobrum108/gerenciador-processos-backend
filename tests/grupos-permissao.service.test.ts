import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarGruposPermissaoService } from "../src/services/grupos-permissao.service.ts";
import { criarPermissoesService } from "../src/services/permissoes.service.ts";
import type { ErroAplicacao } from "../src/erros.ts";

const ATOR = {
  usuarioId: "99999999-9999-9999-9999-999999999999",
  ipOrigem: "127.0.0.1",
  permissoes: [
    "usuarios.grupos.criar",
    "usuarios.grupos.editar",
    "usuarios.grupos.inativar",
    "usuarios.permissoes.editar",
  ],
};

const ATOR_SEM_STATUS = {
  usuarioId: "88888888-8888-8888-8888-888888888888",
  ipOrigem: "127.0.0.1",
  permissoes: ["usuarios.grupos.editar"],
};

const ID_GRUPO = "22222222-2222-2222-2222-222222222222";

function grupoFalso(sobrescritas: Record<string, unknown> = {}) {
  return {
    id: ID_GRUPO,
    nome: "Administradores",
    descricao: null,
    ativo: true,
    criadoEm: new Date("2026-01-01T00:00:00Z"),
    atualizadoEm: new Date("2026-01-01T00:00:00Z"),
    ...sobrescritas,
  };
}

function montarService(opcoes: {
  grupo?: ReturnType<typeof grupoFalso> | null;
  nomeJaUsado?: boolean;
  totalUsuarios?: number;
  atualizacaoRetorna?: ReturnType<typeof grupoFalso> | null;
  permissoesInexistentes?: string[];
  permissoesAtuais?: string[];
} = {}) {
  const grupo = opcoes.grupo === undefined ? grupoFalso() : opcoes.grupo;
  let permissoes = opcoes.permissoesAtuais ?? [];

  const registros = {
    auditorias: [] as any[],
    permissoesSalvas: [] as string[][],
    inativado: 0,
  };

  const service = criarGruposPermissaoService({
    emTransacao: (async (operacao: any) => operacao({} as any)) as any,
    gruposRepository: {
      buscarPorId: async () => grupo,
      nomeJaUsado: async () => opcoes.nomeJaUsado ?? false,
      contarUsuarios: async () => opcoes.totalUsuarios ?? 0,
      criar: async (nome: string, descricao: string | null) =>
        grupoFalso({ nome, descricao }),
      atualizar: async (
        _id: string,
        nome: string,
        descricao: string | null,
        ativo: boolean
      ) =>
        opcoes.atualizacaoRetorna === undefined
          ? grupoFalso({ nome, descricao, ativo })
          : opcoes.atualizacaoRetorna,
      inativar: async () => {
        registros.inativado += 1;
        return grupoFalso({ ativo: false });
      },
      buscarPermissoes: async () => permissoes,
      substituirPermissoes: async (_id: string, permissaoIds: string[]) => {
        registros.permissoesSalvas.push(permissaoIds);
        permissoes = permissaoIds;
      },
    } as any,
    permissoesRepository: {
      listarIdsInexistentes: async () => opcoes.permissoesInexistentes ?? [],
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

describe("grupos-permissao.service criar", () => {
  it("recusa nome duplicado com 409", async () => {
    const { service } = montarService({ nomeJaUsado: true });

    const erro = await capturarErro(() =>
      service.criar({ nome: "Administradores" }, ATOR)
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "NOME_EM_USO");
  });

  it("cria o grupo ativo e registra auditoria", async () => {
    const { service, registros } = montarService();

    const grupo = await service.criar(
      { nome: "  Auditores  ", descricao: "Equipe de auditoria" },
      ATOR
    );

    assert.equal(grupo.nome, "Auditores");
    assert.equal(grupo.ativo, true);
    assert.equal(registros.auditorias[0].acao, "CRIAR");
  });
});

describe("grupos-permissao.service atualizar", () => {
  it("impede inativar grupo com usuarios vinculados", async () => {
    const { service } = montarService({ totalUsuarios: 3 });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_GRUPO,
        {
          nome: "Administradores",
          ativo: false,
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR
      )
    );

    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, "GRUPO_COM_USUARIOS");
  });

  it("responde 409 quando atualizadoEm esta desatualizado", async () => {
    const { service } = montarService({ atualizacaoRetorna: null });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_GRUPO,
        {
          nome: "Administradores",
          ativo: true,
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR
      )
    );

    assert.equal(erro.status, 409);
    assert.equal(erro.codigo, "REGISTRO_DESATUALIZADO");
  });

  it("recusa inativar via PATCH sem a permissao de status", async () => {
    const { service } = montarService({ totalUsuarios: 0 });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_GRUPO,
        {
          nome: "Administradores",
          ativo: false,
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR_SEM_STATUS
      )
    );

    assert.equal(erro.status, 403);
    assert.equal(erro.codigo, "PERMISSAO_NEGADA");
  });

  it("recusa reativar via PATCH sem a permissao de status", async () => {
    const { service } = montarService({ grupo: grupoFalso({ ativo: false }) });

    const erro = await capturarErro(() =>
      service.atualizar(
        ID_GRUPO,
        {
          nome: "Administradores",
          ativo: true,
          atualizadoEm: "2026-01-01T00:00:00.000Z",
        },
        ATOR_SEM_STATUS
      )
    );

    assert.equal(erro.status, 403);
    assert.equal(erro.codigo, "PERMISSAO_NEGADA");
  });

  it("permite editar nome sem a permissao de status quando ativo nao muda", async () => {
    const { service } = montarService();

    const grupo = await service.atualizar(
      ID_GRUPO,
      {
        nome: "Administradores Gerais",
        ativo: true,
        atualizadoEm: "2026-01-01T00:00:00.000Z",
      },
      ATOR_SEM_STATUS
    );

    assert.equal(grupo.nome, "Administradores Gerais");
  });

  it("permite renomear grupo ativo que possui usuarios", async () => {
    const { service } = montarService({ totalUsuarios: 5 });

    const grupo = await service.atualizar(
      ID_GRUPO,
      {
        nome: "Administradores Gerais",
        ativo: true,
        atualizadoEm: "2026-01-01T00:00:00.000Z",
      },
      ATOR
    );

    assert.equal(grupo.nome, "Administradores Gerais");
  });
});

describe("grupos-permissao.service inativar", () => {
  it("impede inativar grupo com usuarios vinculados", async () => {
    const { service } = montarService({ totalUsuarios: 1 });

    const erro = await capturarErro(() =>
      service.inativar(ID_GRUPO, null, ATOR)
    );

    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, "GRUPO_COM_USUARIOS");
  });

  it("responde 404 para grupo inexistente", async () => {
    const { service } = montarService({ grupo: null });

    const erro = await capturarErro(() =>
      service.inativar(ID_GRUPO, null, ATOR)
    );

    assert.equal(erro.status, 404);
  });

  it("inativa grupo sem usuarios e registra o motivo", async () => {
    const { service, registros } = montarService({ totalUsuarios: 0 });

    await service.inativar(ID_GRUPO, "Time desfeito", ATOR);

    assert.equal(registros.inativado, 1);
    assert.equal(registros.auditorias[0].motivo, "Time desfeito");
  });

  it("é idempotente para grupo ja inativo", async () => {
    const { service, registros } = montarService({
      grupo: grupoFalso({ ativo: false }),
    });

    await service.inativar(ID_GRUPO, null, ATOR);

    assert.equal(registros.inativado, 0);
    assert.equal(registros.auditorias.length, 0);
  });
});

describe("grupos-permissao.service substituirPermissoes", () => {
  it("recusa permissao fora do catalogo com 422", async () => {
    const { service } = montarService({
      permissoesInexistentes: ["inventada.permissao"],
    });

    const erro = await capturarErro(() =>
      service.substituirPermissoes(ID_GRUPO, ["inventada.permissao"], ATOR)
    );

    assert.equal(erro.status, 422);
    assert.ok(erro.campos?.permissaoIds);
  });

  it("remove duplicatas antes de gravar", async () => {
    const { service, registros } = montarService();

    await service.substituirPermissoes(
      ID_GRUPO,
      ["usuarios.acessos.view", "usuarios.acessos.view", "usuarios.grupos.view"],
      ATOR
    );

    assert.deepEqual(registros.permissoesSalvas, [
      ["usuarios.acessos.view", "usuarios.grupos.view"],
    ]);
  });

  it("aceita lista vazia, removendo todas as permissoes", async () => {
    const { service, registros } = montarService({
      permissoesAtuais: ["usuarios.acessos.view"],
    });

    const salvas = await service.substituirPermissoes(ID_GRUPO, [], ATOR);

    assert.deepEqual(registros.permissoesSalvas, [[]]);
    assert.deepEqual(salvas, []);
  });

  it("audita o conjunto anterior e o novo", async () => {
    const { service, registros } = montarService({
      permissoesAtuais: ["usuarios.acessos.view"],
    });

    await service.substituirPermissoes(ID_GRUPO, ["usuarios.grupos.view"], ATOR);

    const auditoria = registros.auditorias[0];
    assert.equal(auditoria.acao, "SUBSTITUIR_PERMISSOES");
    assert.deepEqual(auditoria.dadosAnteriores.permissaoIds, [
      "usuarios.acessos.view",
    ]);
    assert.deepEqual(auditoria.dadosNovos.permissaoIds, [
      "usuarios.grupos.view",
    ]);
  });

  it("responde 404 quando o grupo nao existe", async () => {
    const { service } = montarService({ grupo: null });

    const erro = await capturarErro(() =>
      service.substituirPermissoes(ID_GRUPO, [], ATOR)
    );

    assert.equal(erro.status, 404);
  });
});

describe("permissoes.service", () => {
  it("agrupa o catalogo por modulo preservando a ordem", async () => {
    const service = criarPermissoesService({
      permissoesRepository: {
        listar: async () => [
          {
            id: "conferencia.checklist.view",
            nome: "Checklist",
            descricao: null,
            modulo: "Conferencia",
          },
          {
            id: "conferencia.vales.view",
            nome: "Controle de Vales",
            descricao: null,
            modulo: "Conferencia",
          },
          {
            id: "usuarios.acessos.view",
            nome: "Acessos ao Sistema",
            descricao: null,
            modulo: "Usuarios",
          },
        ],
      } as any,
    });

    const modulos = await service.listarAgrupadas();

    assert.equal(modulos.length, 2);
    assert.equal(modulos[0]?.modulo, "Conferencia");
    assert.equal(modulos[0]?.permissoes.length, 2);
    assert.equal(modulos[1]?.modulo, "Usuarios");
    assert.equal(modulos[1]?.permissoes.length, 1);
  });

  it("devolve lista vazia quando o catalogo esta vazio", async () => {
    const service = criarPermissoesService({
      permissoesRepository: { listar: async () => [] } as any,
    });

    assert.deepEqual(await service.listarAgrupadas(), []);
  });
});
