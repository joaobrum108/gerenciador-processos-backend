import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarCargosService } from "../src/services/cargos.service.ts";
import { ErroConflito, ErroNaoEncontrado } from "../src/erros.ts";

interface Registro {
  id: string;
  nome: string;
  nivel: string | null;
  ativo: boolean;
}

function montarService(opcoes: {
  porNome?: Registro | null;
  porId?: Registro | null;
  usuariosVinculados?: number;
}) {
  const criados: unknown[] = [];
  const atualizados: unknown[] = [];

  const service = criarCargosService({
    repositorio: {
      listar: async () => [],
      buscar: async () => opcoes.porId ?? null,
      buscarPorNome: async () => opcoes.porNome ?? null,
      contarUsuarios: async () => opcoes.usuariosVinculados ?? 0,
      criar: async (dados: { nome: string; nivel: string | null }) => {
        criados.push(dados);
        return { id: "novo-1", nome: dados.nome, nivel: dados.nivel, ativo: true };
      },
      atualizar: async (id: string, alteracao: Record<string, unknown>) => {
        atualizados.push({ id, alteracao });
        return {
          id,
          nome: (alteracao.nome as string) ?? "Existente",
          nivel: (alteracao.nivel as string) ?? null,
          ativo: (alteracao.ativo as boolean) ?? true,
        };
      },
    } as never,
  });

  return { service, criados, atualizados };
}

describe("cargos", () => {
  it("apara o nome antes de gravar", async () => {
    const { service, criados } = montarService({});

    await service.criar({
      nome: "  Analista de Processos  ",
      nivel: "Pleno",
      criadoPorUsuarioId: "usuario-1",
    });

    assert.deepEqual(criados, [
      {
        nome: "Analista de Processos",
        nivel: "Pleno",
        criadoPorUsuarioId: "usuario-1",
      },
    ]);
  });

  it("recusa nome ja usado, ignorando caixa", async () => {
    const { service } = montarService({
      porNome: { id: "existe-1", nome: "Auditor", nivel: null, ativo: true },
    });

    await assert.rejects(
      () =>
        service.criar({
          nome: "auditor",
          nivel: null,
          criadoPorUsuarioId: "usuario-1",
        }),
      ErroConflito,
    );
  });

  it("recusa atualizar cargo inexistente", async () => {
    const { service } = montarService({ porId: null });

    await assert.rejects(
      () => service.atualizar("cargo-1", { nome: "Outro" }),
      ErroNaoEncontrado,
    );
  });

  it("recusa desativar cargo em uso", async () => {
    const { service } = montarService({
      porId: { id: "cargo-1", nome: "Auditor", nivel: null, ativo: true },
      usuariosVinculados: 3,
    });

    await assert.rejects(
      () => service.atualizar("cargo-1", { ativo: false }),
      ErroConflito,
    );
  });

  it("permite desativar cargo sem usuarios", async () => {
    const { service, atualizados } = montarService({
      porId: { id: "cargo-1", nome: "Auditor", nivel: null, ativo: true },
      usuariosVinculados: 0,
    });

    const atualizado = await service.atualizar("cargo-1", { ativo: false });

    assert.equal(atualizado.ativo, false);
    assert.equal(atualizados.length, 1);
  });
});
