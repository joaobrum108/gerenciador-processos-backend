import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarRegrasRankingService } from "../src/services/regras-ranking.service.ts";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../src/erros.ts";

interface Registro {
  id: string;
  nome: string;
  pontos: string;
}

function montarService(opcoes: {
  existentePorNome?: Registro | null;
  existentes?: Registro[];
  removeu?: boolean;
} = {}) {
  const criados: unknown[] = [];
  const atualizados: unknown[] = [];

  const service = criarRegrasRankingService({
    repositorio: {
      listar: async () => opcoes.existentes ?? [],
      buscar: async () => null,
      buscarPorNome: async () => opcoes.existentePorNome ?? null,
      criar: async (dados: { nome: string; pontos: number }) => {
        criados.push(dados);
        return {
          id: "regra-1",
          nome: dados.nome,
          pontos: dados.pontos.toFixed(2),
        };
      },
      atualizar: async (id: string, dados: { nome: string; pontos: number }) => {
        atualizados.push({ id, ...dados });
        return opcoes.removeu === false
          ? null
          : { id, nome: dados.nome, pontos: dados.pontos.toFixed(2) };
      },
      remover: async () => opcoes.removeu ?? true,
    } as never,
  });

  return { service, criados, atualizados };
}

describe("regras do ranking", () => {
  it("converte os pontos de texto para numero na listagem", async () => {
    const { service } = montarService({
      existentes: [{ id: "a", nome: "Reincidencia", pontos: "-3.50" }],
    });

    const regras = await service.listar();

    assert.deepEqual(regras, [{ id: "a", nome: "Reincidencia", pontos: -3.5 }]);
  });

  it("remove espacos das pontas do nome antes de gravar", async () => {
    const { service, criados } = montarService();

    await service.criar({ nome: "  Reincidencia  ", pontos: 1, usuarioId: "u1" });

    assert.deepEqual(criados, [
      { nome: "Reincidencia", pontos: 1, criadoPorUsuarioId: "u1" },
    ]);
  });

  it("aceita pontos negativos, que sao o caso de desconto", async () => {
    const { service, criados } = montarService();

    await service.criar({ nome: "Atraso", pontos: -7.25, usuarioId: "u1" });

    assert.equal((criados[0] as { pontos: number }).pontos, -7.25);
  });

  it("entrega o valor intacto ao banco, que arredonda em decimal exato", async () => {
    const { service, criados } = montarService();

    // Arredondar em float aqui divergiria do numeric(10,2): 1.005 daria 1.00
    // no JS e 1.01 no Postgres.
    await service.criar({ nome: "Terco", pontos: 1.005, usuarioId: "u1" });

    assert.equal((criados[0] as { pontos: number }).pontos, 1.005);
  });


  it("recusa nome vazio", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar({ nome: "   ", pontos: 1, usuarioId: "u1" }),
      ErroValidacao,
    );
  });

  it("recusa pontos nao numericos", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar({ nome: "Regra", pontos: Number.NaN, usuarioId: "u1" }),
      ErroValidacao,
    );
  });

  it("recusa nome ja usado por outra regra", async () => {
    const { service } = montarService({
      existentePorNome: { id: "outra", nome: "Reincidencia", pontos: "1.00" },
    });

    await assert.rejects(
      () => service.criar({ nome: "reincidencia", pontos: 1, usuarioId: "u1" }),
      ErroConflito,
    );
  });

  it("avisa quando a regra editada nao existe mais", async () => {
    const { service } = montarService({ removeu: false });

    await assert.rejects(
      () => service.definir("sumiu", { nome: "Regra", pontos: 1 }),
      ErroNaoEncontrado,
    );
  });

  it("avisa quando a regra removida nao existe", async () => {
    const { service } = montarService({ removeu: false });

    await assert.rejects(() => service.remover("sumiu"), ErroNaoEncontrado);
  });
});
