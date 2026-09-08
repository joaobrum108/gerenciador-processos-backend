import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarParametrizacoesService } from "../src/services/parametrizacoes-devolucao.service.ts";
import { ErroConflito, ErroNaoEncontrado } from "../src/erros.ts";

interface Registro {
  id: string;
  nome: string;
  ativo: boolean;
}

function montarService(opcoes: {
  existentePorNome?: Registro | null;
  existentePorId?: Registro | null;
}) {
  const criados: unknown[] = [];
  const atualizados: unknown[] = [];

  const service = criarParametrizacoesService({
    repositorio: {
      listarMotivos: async () => [],
      listarParadeiros: async () => [],
      buscar: async () => opcoes.existentePorId ?? null,
      buscarPorNome: async () => opcoes.existentePorNome ?? null,
      criar: async (tabela: string, dados: { nome: string }) => {
        criados.push({ tabela, ...dados });
        return { id: "novo-1", nome: dados.nome, ativo: true };
      },
      atualizar: async (
        tabela: string,
        id: string,
        alteracao: Record<string, unknown>,
      ) => {
        atualizados.push({ tabela, id, alteracao });
        return {
          id,
          nome: (alteracao.nome as string) ?? "Existente",
          ativo: (alteracao.ativo as boolean) ?? true,
        };
      },
    } as never,
  });

  return { service, criados, atualizados };
}

describe("parametrizacoes de devolucao", () => {
  it("grava o motivo na tabela de motivos", async () => {
    const { service, criados } = montarService({});

    const criado = await service.criar("motivo", {
      nome: "Equipamento com defeito",
      criadoPorUsuarioId: "usuario-1",
    });

    assert.equal(criado.nome, "Equipamento com defeito");
    assert.deepEqual(criados, [
      {
        tabela: "motivos_devolucao",
        nome: "Equipamento com defeito",
        criadoPorUsuarioId: "usuario-1",
      },
    ]);
  });

  it("grava o paradeiro na tabela de paradeiros", async () => {
    const { service, criados } = montarService({});

    await service.criar("paradeiro", {
      nome: "Almoxarifado",
      criadoPorUsuarioId: "usuario-1",
    });

    assert.equal(
      (criados[0] as { tabela: string }).tabela,
      "paradeiros",
    );
  });

  it("recusa nome ja usado", async () => {
    const { service } = montarService({
      existentePorNome: { id: "existente-1", nome: "Roubo", ativo: true },
    });

    await assert.rejects(
      () =>
        service.criar("motivo", {
          nome: "roubo",
          criadoPorUsuarioId: "usuario-1",
        }),
      ErroConflito,
    );
  });

  it("recusa atualizar registro inexistente", async () => {
    const { service } = montarService({ existentePorId: null });

    await assert.rejects(
      () =>
        service.atualizar("motivo", "11111111-1111-1111-1111-111111111111", {
          nome: "Outro",
        }),
      ErroNaoEncontrado,
    );
  });

  it("desativa sem exigir nome novo", async () => {
    const { service, atualizados } = montarService({
      existentePorId: { id: "existente-1", nome: "Roubo", ativo: true },
    });

    const atualizado = await service.atualizar("motivo", "existente-1", {
      ativo: false,
    });

    assert.equal(atualizado.ativo, false);
    assert.deepEqual(
      (atualizados[0] as { alteracao: unknown }).alteracao,
      { ativo: false },
    );
  });
});
