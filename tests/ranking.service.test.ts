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

interface ConfiguracaoFalsa {
  pontosPorErro: string;
  erroAcrescenta?: boolean;
  pontosPorMinutoAtraso: string;
  atrasoAcrescenta?: boolean;
  pontosPorFalta: string;
  faltaAcrescenta?: boolean;
  limiteAltaPerformance: string;
}

interface PontoFalso {
  usuarioId: string;
  funcionarioIxcId: string;
  atrasoMinutos: number;
  faltas: number;
}

function derivarOsPorAssunto(grupos: GrupoFalso[]) {
  const porChave = new Map<
    string,
    { operadorIxcId: number | null; assuntoIxcId: number | null; osDistintas: number }
  >();

  for (const item of grupos) {
    const chave = `${item.operadorIxcId}:${item.assuntoIxcId}`;
    const atual = porChave.get(chave) ?? {
      operadorIxcId: item.operadorIxcId,
      assuntoIxcId: item.assuntoIxcId,
      osDistintas: 0,
    };

    atual.osDistintas += Number(item.total);
    porChave.set(chave, atual);
  }

  return [...porChave.values()];
}

function montarService(opcoes: {
  grupos?: GrupoFalso[];
  osPorAssunto?: {
    operadorIxcId: number | null;
    assuntoIxcId: number | null;
    osDistintas: number;
  }[];
  pontos?: { assuntoOsIxcId: string; pontos: string }[];
  ponto?: PontoFalso[];
  funcionarios?: Map<number, string>;
  vinculados?: { usuarioId: string; funcionarioIxcId: string }[];
  configuracao?: ConfiguracaoFalsa | null;
}) {
  const gravadas: unknown[] = [];
  const grupos = opcoes.grupos ?? [];

  const operadores = [
    ...new Set(
      [
        ...grupos.map((g) => g.operadorIxcId),
        ...(opcoes.osPorAssunto ?? []).map((l) => l.operadorIxcId),
      ].filter((id): id is number => id !== null),
    ),
  ];

  const funcionarios =
    opcoes.funcionarios ??
    new Map(operadores.map((id) => [id, `f-${id}`]));

  const vinculados =
    opcoes.vinculados ??
    [...funcionarios.entries()].map(([id, func]) => ({
      usuarioId: `u-${id}`,
      funcionarioIxcId: func,
    }));

  const service = criarRankingService({
    buscarNomes: async () => new Map<number, string>(),
    buscarFuncionarios: async () => funcionarios,
    repositorioAuditorias: {
      resumir: async () => ({ grupos, intervalos: [] }),
      contarOsPorAssunto: async () =>
        opcoes.osPorAssunto ?? derivarOsPorAssunto(grupos),
    } as never,
    repositorioPontuacao: {
      listarRegras: async () => opcoes.pontos ?? [],
    } as never,
    repositorioRanking: {
      buscarConfiguracaoVigente: async () =>
        opcoes.configuracao == null
          ? null
          : {
              id: "c1",
              erroAcrescenta: false,
              atrasoAcrescenta: false,
              faltaAcrescenta: false,
              ...opcoes.configuracao,
              vigenteDe: new Date(),
            },
      resumirPontoPorUsuario: async () => opcoes.ponto ?? [],
      listarUsuariosVinculados: async () => vinculados,
      gravarConfiguracao: async (dados: unknown) => {
        gravadas.push(dados);
        const d = dados as Record<string, number & boolean>;
        return {
          id: "c1",
          pontosPorErro: String(d.pontosPorErro),
          erroAcrescenta: Boolean(d.erroAcrescenta),
          pontosPorMinutoAtraso: String(d.pontosPorMinutoAtraso),
          atrasoAcrescenta: Boolean(d.atrasoAcrescenta),
          pontosPorFalta: String(d.pontosPorFalta),
          faltaAcrescenta: Boolean(d.faltaAcrescenta),
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
        erroAcrescenta: true,
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
        pontosPorMinutoAtraso: "2",
        pontosPorFalta: "1000",
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
      erroAcrescenta: true,
      pontosPorMinutoAtraso: 2,
      atrasoAcrescenta: false,
      pontosPorFalta: 1000,
      faltaAcrescenta: false,
      limiteAltaPerformance: 4000,
      usuarioId: "u1",
    });

    assert.equal(regras.pontosPorErro, 10);
    assert.equal(regras.erroAcrescenta, true);
    assert.equal(regras.faltaAcrescenta, false);
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
        erroAcrescenta: false,
        pontosPorMinutoAtraso: 0,
        atrasoAcrescenta: false,
        pontosPorFalta: 0,
        faltaAcrescenta: false,
        limiteAltaPerformance: -1,
        usuarioId: "u1",
      }),
    );
  });

  it("recusa pontos negativos porque o sinal vem do booleano", async () => {
    const { service } = montarService({});

    await assert.rejects(() =>
      service.definirConfiguracao({
        pontosPorErro: 0,
        erroAcrescenta: false,
        pontosPorMinutoAtraso: 0,
        atrasoAcrescenta: false,
        pontosPorFalta: -1000,
        faltaAcrescenta: false,
        limiteAltaPerformance: 0,
        usuarioId: "u1",
      }),
    );
  });
});

describe("ranking: sinal e ponto", () => {
  it("desconta atraso e falta quando o booleano diz descontar", async () => {
    const { service } = montarService({
      grupos: [grupo({ operadorIxcId: 924, total: "5" })],
      pontos: [{ assuntoOsIxcId: "398", pontos: "1000" }],
      funcionarios: new Map([[924, "94424"]]),
      vinculados: [{ usuarioId: "u-davi", funcionarioIxcId: "94424" }],
      ponto: [
        {
          usuarioId: "u-davi",
          funcionarioIxcId: "94424",
          atrasoMinutos: 10,
          faltas: 0,
        },
      ],
      configuracao: {
        pontosPorErro: "0",
        pontosPorMinutoAtraso: "120",
        atrasoAcrescenta: false,
        pontosPorFalta: "1000",
        limiteAltaPerformance: "0",
      },
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.pontosOs, 5000);
    assert.equal(item?.composicao.atrasoMinutos, 10);
    assert.equal(item?.composicao.pontosAtrasos, 1200);
    assert.equal(item?.pontuacaoFinal, 3800);
    assert.equal(item?.usuarioId, "u-davi");
  });

  it("acrescenta quando o booleano diz acrescentar", async () => {
    const { service } = montarService({
      grupos: [grupo({ operadorIxcId: 924, total: "1" })],
      funcionarios: new Map([[924, "94424"]]),
      vinculados: [{ usuarioId: "u-davi", funcionarioIxcId: "94424" }],
      ponto: [
        {
          usuarioId: "u-davi",
          funcionarioIxcId: "94424",
          atrasoMinutos: 0,
          faltas: 2,
        },
      ],
      configuracao: {
        pontosPorErro: "0",
        pontosPorMinutoAtraso: "0",
        pontosPorFalta: "50",
        faltaAcrescenta: true,
        limiteAltaPerformance: "0",
      },
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.pontosFaltas, 100);
    assert.equal(item?.pontuacaoFinal, 100);
  });

  it("lista auditor sem colaborador vinculado, com usuarioId nulo", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ operadorIxcId: 999, total: "3" }),
        grupo({ operadorIxcId: 924, total: "5" }),
      ],
      funcionarios: new Map([[924, "94424"]]),
      vinculados: [{ usuarioId: "u-davi", funcionarioIxcId: "94424" }],
    });

    const itens = (await service.gerar(PERIODO)).itens;

    assert.equal(itens.length, 2);
    assert.equal(
      itens.find((i) => i.auditorIxcId === 924)?.usuarioId,
      "u-davi",
    );
    assert.equal(itens.find((i) => i.auditorIxcId === 999)?.usuarioId, null);
  });

  it("conta O.S por chamado distinto, nao por mensagem", async () => {
    const { service } = montarService({
      grupos: [
        grupo({ total: "4", diagnostico: "AUDITORIA CONCLUIDA" }),
        grupo({ total: "3", diagnostico: "OUTRO DIAGNOSTICO" }),
      ],
      osPorAssunto: [
        { operadorIxcId: 430, assuntoIxcId: 398, osDistintas: 5 },
      ],
      pontos: [{ assuntoOsIxcId: "398", pontos: "10" }],
    });

    const [item] = (await service.gerar(PERIODO)).itens;

    assert.equal(item?.composicao.osAuditadas, 5);
    assert.equal(item?.composicao.pontosOs, 50);
  });
});
