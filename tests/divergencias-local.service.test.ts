import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  criarDivergenciasLocalService,
  formatarDataIxc,
  paraContrato,
} from "../src/services/services.divergencias.local.ts";
import type { DivergenciaLocal } from "../src/repositories/repositorio.divergencias.local.ts";

const PERIODO = { dataInicio: "2026-08-27", dataFim: "2026-08-29" };

function linhaFalsa(
  sobrescritas: Partial<DivergenciaLocal> = {},
): DivergenciaLocal {
  return {
    ocorrenciaIxcId: "8274488",
    chamadoIxcId: "2380732",
    ticketIxcId: "1439709",
    clienteIxcId: 321790,
    clienteNome: "ANDREIA MORAIS DA SILVA",
    tituloOs: "01.1 - INSTALAÇÃO_RESIDENCIAL #",
    assuntoIxcId: 520,
    assunto: "DIVERGENCIA DE O.S",
    diagnosticoIxcId: 590,
    diagnostico: "SEM FOTO DE EPI",
    tecnicoIxcId: 93838,
    tecnicoNome: "RES - RICARDO ANDRADE VIANA",
    auditorIxcId: 924,
    auditorNome: "DAVI RODRIGUES DE CARVALHO",
    observacao: "SEM FOTO DE EPI",
    tipoDivergencia: "DIVERGENCIA DE O.S",
    abertoEm: new Date(2026, 8, 3, 8, 7, 6),
    fechadoEm: new Date(2026, 8, 3, 8, 7, 55),
    ...sobrescritas,
  };
}

describe("divergencias.local formatarDataIxc", () => {
  it("usa o formato dd/MM/yyyy HH:mm:ss que o frontend espera", () => {
    assert.equal(
      formatarDataIxc(new Date(2026, 8, 3, 8, 7, 55)),
      "03/09/2026 08:07:55",
    );
  });

  it("preenche com zero a esquerda", () => {
    assert.equal(
      formatarDataIxc(new Date(2026, 0, 5, 9, 4, 2)),
      "05/01/2026 09:04:02",
    );
  });
});

describe("divergencias.local paraContrato", () => {
  it("converte os identificadores grandes de texto para numero", () => {
    const d = paraContrato(linhaFalsa());

    assert.equal(d.ocorrenciaIxcId, 8274488);
    assert.equal(d.chamadoIxcId, 2380732);
    assert.equal(d.ticketIxcId, 1439709);
  });

  it("mantem nulo o ticket ausente", () => {
    assert.equal(paraContrato(linhaFalsa({ ticketIxcId: null })).ticketIxcId, null);
  });

  it("preserva os campos que a tela usa", () => {
    const d = paraContrato(linhaFalsa());

    assert.equal(d.tecnicoNome, "RES - RICARDO ANDRADE VIANA");
    assert.equal(d.auditorNome, "DAVI RODRIGUES DE CARVALHO");
    assert.equal(d.observacao, "SEM FOTO DE EPI");
    assert.equal(d.tipoDivergencia, "DIVERGENCIA DE O.S");
    assert.equal(d.tituloOs, "01.1 - INSTALAÇÃO_RESIDENCIAL #");
  });
});

describe("divergencias.local service", () => {
  it("repassa o periodo e devolve as linhas convertidas", async () => {
    const recebidos: unknown[] = [];
    const service = criarDivergenciasLocalService({
      repositorioLocal: {
        listar: async (periodo: unknown) => {
          recebidos.push(periodo);
          return [linhaFalsa(), linhaFalsa({ ocorrenciaIxcId: "8274489" })];
        },
      } as never,
    });

    const dados = await service.listar(PERIODO);

    assert.deepEqual(recebidos, [PERIODO]);
    assert.deepEqual(
      dados.map((d) => d.ocorrenciaIxcId),
      [8274488, 8274489],
    );
  });

  it("devolve lista vazia quando o periodo nao tem divergencia", async () => {
    const service = criarDivergenciasLocalService({
      repositorioLocal: { listar: async () => [] } as never,
    });

    assert.deepEqual(await service.listar(PERIODO), []);
  });
});
