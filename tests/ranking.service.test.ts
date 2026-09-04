import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REGRAS_ZERADAS,
  criarRankingService,
} from "../src/services/ranking.service.ts";

const PERIODO = { dataInicio: "2026-08-01", dataFim: "2026-08-31" };

interface GrupoFalso {
  operadorIxcId: number | null;
  auditorNome: string | null;
  assuntoIxcId: number | null;
  assunto: string | null;
  diagnostico: string | null;
  tarefa: string | null;
  total: string;
}

function grupo(sobrescritas: Partial<GrupoFalso> = {}): GrupoFalso {
  return {
    operadorIxcId: 430,
    auditorNome: "PAMELA EVELYN DA SILVA",
    assuntoIxcId: 398,
    assunto: "AUDITORIA REPARO RESIDENCIAL #",
    diagnostico: "AUDITORIA CONCLUIDA",
    tarefa: null,
    total: "10",
    ...sobrescritas,
  };
}

function montarService(opcoes: {
  grupos?: GrupoFalso[];
  pontos?: { assuntoOsIxcId: string; pontos: string }[];
  configuracao?: {
    pontosPorErro: string;
    pontosPorMinutoAtraso: string;
    pontosPorFalta: string;
    limiteAltaPerformance: string;
  } | null;
}) {
  const gravadas: unknown[] = [];

  const service = criarRankingService({
    repositorioAuditorias: {
      resumir: async () => ({ grupos: opcoes.grupos ?? [], intervalos: [] }),
    } as never,
    repositorioPontuacao: {
      listarRegras: async () => opcoes.pontos ?? [],
    } as never,
    repositorioRanking: {
      buscarConfiguracaoVigente: async () => opcoes.configuracao ?? null,
      gravarConfiguracao: async (dados: unknown) => {
        gravadas.push(dados);
        const d = dados as Record<string, number>;
        return {
          id: "c1",
          pontosPorErro: String(d.pontosPorErro),
          pontosPorMinutoAtraso: String(d.pontosPorMinutoAtraso),
          pontosPorFalta: String(d.pontosPorFalta),
          limiteAltaPerformance: String(d.limiteAltaPerformance),
          vigenteDe: new Date(),
        };
      },
    } as never,
  });

  return { service, gravadas };
}

describe("ranking sem configuracao", () => {
  it("usa regras zeradas quando nao ha configuracao gravada", async () => {
    const { service } = montarService({ grupos: [grupo()] });

    const ranking = await service.gerar(PERIODO);

    assert.deepEqual(ranking.regras, REGRAS_ZERADAS);
  });

  it("conta as O.S mesmo sem pontuacao configurada", async () => {
    const { service } = montarService({ grupos: [grupo({ total: "25" })] });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.osAuditadas, 25);
    assert.equal(item?.composicao.pontosOs, 0);
    assert.equal(item?.pontuacaoFinal, 0);
  });

  it("nao marca alta performance quando o limite e zero", async () => {
    const { service } = montarService({ grupos: [grupo()] });

    assert.equal((await service.gerar(PERIODO)).itens[0]?.altaPerformance, false);
  });
});

describe("ranking com pontuacao por servico", () => {
  it("multiplica as O.S pelos pontos do assunto", async () => {
    const { service } = montarService({
      grupos: [grupo({ total: "10", assuntoIxcId: 398 })],
      pontos: [{ assuntoOsIxcId: "398", pontos: "3" }],
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.pontosOs, 30);
    assert.equal(item?.pontuacaoFinal, 30);
  });

  it("soma assuntos diferentes com pontos diferentes", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ total: "10", assuntoIxcId: 398 }),
        grupo({ total: "5", assuntoIxcId: 627 }),
      ],
      pontos: [
        { assuntoOsIxcId: "398", pontos: "3" },
        { assuntoOsIxcId: "627", pontos: "2" },
      ],
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.osAuditadas, 15);
    assert.equal(item?.composicao.pontosOs, 40);
  });

  it("assunto sem pontuacao configurada nao soma pontos", async () => {
    const { service } = montarService({
      grupos: [grupo({ total: "10", assuntoIxcId: 999 })],
      pontos: [{ assuntoOsIxcId: "398", pontos: "3" }],
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.osAuditadas, 10);
    assert.equal(item?.composicao.pontosOs, 0);
  });
});

describe("ranking com erros encontrados", () => {
  it("conta como erro o grupo classificado com divergencia", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ total: "8", tarefa: null }),
        grupo({ total: "2", tarefa: "DIVERGENCIA DE O.S" }),
      ],
      configuracao: {
        pontosPorErro: "10",
        pontosPorMinutoAtraso: "0",
        pontosPorFalta: "0",
        limiteAltaPerformance: "0",
      },
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.osAuditadas, 10);
    assert.equal(item?.composicao.errosEncontrados, 2);
    assert.equal(item?.composicao.pontosErros, 20);
  });

  it("nao conta erro quando a tarefa nega a divergencia", async () => {
    const { service } = montarService({
      grupos: [grupo({ total: "5", tarefa: "SEM DIVERGENCIA | SEM TROCA" })],
      configuracao: {
        pontosPorErro: "10",
        pontosPorMinutoAtraso: "0",
        pontosPorFalta: "0",
        limiteAltaPerformance: "0",
      },
    });

    assert.equal(
      (await service.gerar(PERIODO)).itens[0]?.composicao.errosEncontrados,
      0,
    );
  });
});

describe("ranking: atraso e falta", () => {
  it("ficam zerados enquanto nao existe registro de ponto", async () => {
    const { service } = montarService({
      grupos: [grupo()],
      configuracao: {
        pontosPorErro: "0",
        pontosPorMinutoAtraso: "-2",
        pontosPorFalta: "-1000",
        limiteAltaPerformance: "0",
      },
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.atrasoMinutos, 0);
    assert.equal(item?.composicao.pontosAtrasos, 0);
    assert.equal(item?.composicao.faltas, 0);
    assert.equal(item?.composicao.pontosFaltas, 0);
  });
});

describe("ranking: ordenacao e posicao", () => {
  it("ordena por pontuacao e numera as posicoes", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ operadorIxcId: 1, auditorNome: "MENOS", total: "5" }),
        grupo({ operadorIxcId: 2, auditorNome: "MAIS", total: "20" }),
      ],
      pontos: [{ assuntoOsIxcId: "398", pontos: "1" }],
    });

    const itens = (await service.gerar(PERIODO)).itens;

    assert.deepEqual(
      itens.map((i) => [i.posicao, i.auditor]),
      [
        [1, "MAIS"],
        [2, "MENOS"],
      ],
    );
  });

  it("desempata pelo volume de O.S auditadas", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ operadorIxcId: 1, auditorNome: "POUCAS", total: "5" }),
        grupo({ operadorIxcId: 2, auditorNome: "MUITAS", total: "50" }),
      ],
    });

    assert.equal((await service.gerar(PERIODO)).itens[0]?.auditor, "MUITAS");
  });

  it("marca alta performance acima do limite configurado", async () => {
    const { service } = montarService({
      grupos: [grupo({ total: "100" })],
      pontos: [{ assuntoOsIxcId: "398", pontos: "2" }],
      configuracao: {
        pontosPorErro: "0",
        pontosPorMinutoAtraso: "0",
        pontosPorFalta: "0",
        limiteAltaPerformance: "150",
      },
    });

    assert.equal((await service.gerar(PERIODO)).itens[0]?.altaPerformance, true);
  });
});

describe("ranking: configuracao", () => {
  it("grava a configuracao com o usuario", async () => {
    const { service, gravadas } = montarService({});

    const regras = await service.definirConfiguracao({
      pontosPorErro: 10,
      pontosPorMinutoAtraso: -2,
      pontosPorFalta: -1000,
      limiteAltaPerformance: 4000,
      usuarioId: "u1",
    });

    assert.equal(regras.pontosPorErro, 10);
    assert.equal(
      (gravadas[0] as { criadoPorUsuarioId: string }).criadoPorUsuarioId,
      "u1",
    );
  });

  it("recusa limite negativo", async () => {
    const { service } = montarService({});

    await assert.rejects(() =>
      service.definirConfiguracao({
        pontosPorErro: 0,
        pontosPorMinutoAtraso: 0,
        pontosPorFalta: 0,
        limiteAltaPerformance: -1,
        usuarioId: "u1",
      }),
    );
  });
});
