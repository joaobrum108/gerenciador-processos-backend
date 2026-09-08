import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarFuncionariosIxcService } from "../src/services/services.funcionarios.ixc.ts";
import { ErroNaoEncontrado } from "../src/erros.ts";

function montarService(opcoes: {
  dados?: { idIxc: string; nome: string; ativo: boolean }[];
  total?: number;
  porId?: { idIxc: string; nome: string; ativo: boolean } | null;
}) {
  const chamadas: { filtros: unknown; ordenacao?: unknown }[] = [];

  const service = criarFuncionariosIxcService({
    funcionariosIxcRepository: {
      listar: async (filtros: unknown, ordenacao: unknown) => {
        chamadas.push({ filtros, ordenacao });
        return opcoes.dados ?? [];
      },
      contar: async (filtros: unknown) => {
        chamadas.push({ filtros });
        return opcoes.total ?? 0;
      },
      buscarPorId: async () => opcoes.porId ?? null,
    } as never,
  });

  return { service, chamadas };
}

describe("funcionarios do IXC", () => {
  it("devolve dados e total para montar a paginacao", async () => {
    const { service } = montarService({
      dados: [{ idIxc: "1", nome: "ANA", ativo: true }],
      total: 1096,
    });

    const resultado = await service.listar(
      { ativo: true },
      { ordenarPor: "nome", ordem: "asc", pagina: 1, porPagina: 100 },
    );

    assert.equal(resultado.total, 1096);
    assert.deepEqual(resultado.dados, [{ idIxc: "1", nome: "ANA", ativo: true }]);
  });

  it("repassa os mesmos filtros para listar e contar", async () => {
    const { service, chamadas } = montarService({ total: 3 });

    await service.listar(
      { ativo: true, busca: "silva" },
      { ordenarPor: "nome", ordem: "asc", pagina: 2, porPagina: 50 },
    );

    assert.equal(chamadas.length, 2);
    for (const chamada of chamadas) {
      assert.deepEqual(chamada.filtros, { ativo: true, busca: "silva" });
    }
  });

  it("repassa a ordenacao recebida", async () => {
    const { service, chamadas } = montarService({});

    await service.listar(
      {},
      { ordenarPor: "id", ordem: "desc", pagina: 3, porPagina: 25 },
    );

    assert.deepEqual(chamadas[0]?.ordenacao, {
      ordenarPor: "id",
      ordem: "desc",
      pagina: 3,
      porPagina: 25,
    });
  });

  it("recusa funcionario inexistente", async () => {
    const { service } = montarService({ porId: null });

    await assert.rejects(() => service.buscarPorId(999), ErroNaoEncontrado);
  });
});
