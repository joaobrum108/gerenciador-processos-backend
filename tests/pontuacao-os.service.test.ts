import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PONTOS_MAXIMO,
  PONTOS_PADRAO,
  criarPontuacaoOsService,
  validarPontos,
} from "../src/services/pontuacao-os.service.ts";

function montarService(opcoes: {
  servicos?: { assuntoOsIxcId: string; assuntoOs: string; ocorrencias: string }[];
  regras?: {
    id: string;
    assuntoOsIxcId: string;
    assuntoOs: string;
    pontos: string;
    vigenteDe: Date;
    ativo: boolean;
  }[];
  removeu?: boolean;
}) {
  const gravadas: unknown[] = [];
  const removidas: string[] = [];

  const service = criarPontuacaoOsService({
    repositorio: {
      listarServicosDoEspelho: async () => opcoes.servicos ?? [],
      listarRegras: async () => opcoes.regras ?? [],
      gravarRegra: async (dados: {
        assuntoOsIxcId: string;
        assuntoOs: string;
        pontos: number;
      }) => {
        gravadas.push(dados);
        return {
          id: "regra-1",
          assuntoOsIxcId: dados.assuntoOsIxcId,
          assuntoOs: dados.assuntoOs,
          pontos: String(dados.pontos),
          vigenteDe: new Date(),
          ativo: true,
        };
      },
      removerRegra: async (assunto: string) => {
        removidas.push(assunto);
        return opcoes.removeu ?? true;
      },
    } as never,
  });

  return { service, gravadas, removidas };
}

const SERVICO = {
  assuntoOsIxcId: "398",
  assuntoOs: "AUDITORIA REPARO RESIDENCIAL #",
  ocorrencias: "55339",
};

const REGRA = {
  id: "r1",
  assuntoOsIxcId: "398",
  assuntoOs: "AUDITORIA REPARO RESIDENCIAL #",
  pontos: "3.50",
  vigenteDe: new Date(),
  ativo: true,
};

describe("pontuacaoOs.validarPontos", () => {
  it("aceita valor dentro da faixa", () => {
    assert.equal(validarPontos(3), 3);
  });

  it("arredonda para duas casas", () => {
    assert.equal(validarPontos(2.567), 2.57);
  });

  it("recusa valor negativo", () => {
    assert.throws(() => validarPontos(-1), (erro: unknown) => {
      const campos = (erro as { campos?: Record<string, string[]> }).campos;
      return /entre/.test(campos?.pontos?.[0] ?? "");
    });
  });

  it("recusa valor acima do maximo", () => {
    assert.throws(() => validarPontos(PONTOS_MAXIMO + 1), (erro: unknown) => {
      const campos = (erro as { campos?: Record<string, string[]> }).campos;
      return /entre/.test(campos?.pontos?.[0] ?? "");
    });
  });

  it("recusa valor que nao e numero", () => {
    assert.throws(() => validarPontos(Number.NaN), (erro: unknown) => {
      const campos = (erro as { campos?: Record<string, string[]> }).campos;
      return /numero/.test(campos?.pontos?.[0] ?? "");
    });
  });
});

describe("pontuacaoOs.listar", () => {
  it("servico sem regra recebe a pontuacao padrao e sai como nao configurado", async () => {
    const { service } = montarService({ servicos: [SERVICO] });

    const [item] = await service.listar();

    assert.equal(item?.pontos, PONTOS_PADRAO);
    assert.equal(item?.configurado, false);
    assert.equal(item?.ocorrencias, 55339);
  });

  it("servico com regra usa a pontuacao configurada", async () => {
    const { service } = montarService({ servicos: [SERVICO], regras: [REGRA] });

    const [item] = await service.listar();

    assert.equal(item?.pontos, 3.5);
    assert.equal(item?.configurado, true);
  });

  it("regra de servico que nao aparece mais no espelho continua na lista", async () => {
    const { service } = montarService({
      servicos: [],
      regras: [{ ...REGRA, assuntoOsIxcId: "999", assuntoOs: "SERVICO ANTIGO" }],
    });

    const itens = await service.listar();

    assert.equal(itens.length, 1);
    assert.equal(itens[0]?.assuntoOs, "SERVICO ANTIGO");
    assert.equal(itens[0]?.ocorrencias, 0);
  });

  it("nao duplica o servico que tem regra e aparece no espelho", async () => {
    const { service } = montarService({ servicos: [SERVICO], regras: [REGRA] });

    assert.equal((await service.listar()).length, 1);
  });

  it("ordena por nome do servico", async () => {
    const { service } = montarService({
      servicos: [
        { ...SERVICO, assuntoOsIxcId: "1", assuntoOs: "ZEBRA" },
        { ...SERVICO, assuntoOsIxcId: "2", assuntoOs: "ABACATE" },
      ],
    });

    assert.deepEqual(
      (await service.listar()).map((i) => i.assuntoOs),
      ["ABACATE", "ZEBRA"],
    );
  });
});

describe("pontuacaoOs.definir", () => {
  it("grava a pontuacao com o usuario que fez a alteracao", async () => {
    const { service, gravadas } = montarService({});

    const item = await service.definir({
      assuntoOsIxcId: "398",
      assuntoOs: "AUDITORIA REPARO RESIDENCIAL #",
      pontos: 4,
      usuarioId: "usuario-1",
    });

    assert.equal(item.pontos, 4);
    assert.equal(item.configurado, true);
    assert.equal(
      (gravadas[0] as { criadoPorUsuarioId: string }).criadoPorUsuarioId,
      "usuario-1",
    );
  });

  it("recusa nome de servico vazio", async () => {
    const { service } = montarService({});

    await assert.rejects(
      () =>
        service.definir({
          assuntoOsIxcId: "398",
          assuntoOs: "   ",
          pontos: 2,
          usuarioId: "u1",
        }),
      /Dados invalidos/,
    );
  });

  it("recusa pontuacao fora da faixa antes de gravar", async () => {
    const { service, gravadas } = montarService({});

    await assert.rejects(() =>
      service.definir({
        assuntoOsIxcId: "398",
        assuntoOs: "X",
        pontos: -5,
        usuarioId: "u1",
      }),
    );

    assert.equal(gravadas.length, 0);
  });
});

describe("pontuacaoOs.remover", () => {
  it("remove a regra do servico", async () => {
    const { service, removidas } = montarService({ removeu: true });

    await service.remover("398");

    assert.deepEqual(removidas, ["398"]);
  });

  it("reclama quando nao existe regra para remover", async () => {
    const { service } = montarService({ removeu: false });

    await assert.rejects(() => service.remover("398"), /nao encontrada/);
  });
});
