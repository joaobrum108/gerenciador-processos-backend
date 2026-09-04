import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarDivergenciasService } from "../src/services/services.divergencias.ixc.ts";
import type { DivergenciaIxc } from "../src/repositories/repositorio.divergencias.ixc.ts";

const PERIODO = { dataInicio: "2026-08-27", dataFim: "2026-08-29" };

function divergenciaFalsa(
  sobrescritas: Partial<DivergenciaIxc> = {},
): DivergenciaIxc {
  return {
    ocorrenciaIxcId: 1,
    chamadoIxcId: 10,
    ticketIxcId: 100,
    clienteIxcId: 1000,
    clienteNome: "Cliente Teste",
    tituloOs: "Instalacao",
    assuntoIxcId: 5,
    assunto: "DIVERGENCIA DE O.S",
    diagnosticoIxcId: 7,
    diagnostico: "Sem foto de EPI",
    tecnicoIxcId: 20,
    tecnicoNome: "RES - Fulano",
    auditorIxcId: 30,
    auditorNome: null,
    observacao: "Foto do EPI ausente na O.S",
    abertoEm: "27/08/2026 09:00:00",
    fechadoEm: "27/08/2026 11:00:00",
    ...sobrescritas,
  };
}

function montarService(opcoes: {
  divergencias: DivergenciaIxc[];
  nomes?: Map<number, string>;
}) {
  const idsRecebidos: number[][] = [];

  const service = criarDivergenciasService({
    repositorioDivergencias: {
      listar: async () => opcoes.divergencias,
      buscarNomesOperadores: async (ids: number[]) => {
        idsRecebidos.push(ids);
        return opcoes.nomes ?? new Map();
      },
    } as never,
  });

  return { service, idsRecebidos };
}

describe("divergencias.service resolucao do auditor", () => {
  it("preenche auditorNome a partir do id do operador", async () => {
    const { service } = montarService({
      divergencias: [divergenciaFalsa({ auditorIxcId: 30 })],
      nomes: new Map([[30, "Pamela Evelyn da Silva"]]),
    });

    const dados = await service.listar(PERIODO);

    assert.equal(dados[0]?.auditorNome, "Pamela Evelyn da Silva");
  });

  it("mantem auditorNome nulo quando nao ha operador na ocorrencia", async () => {
    const { service } = montarService({
      divergencias: [divergenciaFalsa({ auditorIxcId: null })],
      nomes: new Map([[30, "Pamela Evelyn da Silva"]]),
    });

    const dados = await service.listar(PERIODO);

    assert.equal(dados[0]?.auditorNome, null);
  });

  it("mantem auditorNome nulo quando o operador nao existe em usuarios", async () => {
    const { service } = montarService({
      divergencias: [divergenciaFalsa({ auditorIxcId: 999 })],
      nomes: new Map(),
    });

    const dados = await service.listar(PERIODO);

    assert.equal(dados[0]?.auditorNome, null);
  });

  it("consulta cada operador uma unica vez, sem repetir ids", async () => {
    const { service, idsRecebidos } = montarService({
      divergencias: [
        divergenciaFalsa({ ocorrenciaIxcId: 1, auditorIxcId: 30 }),
        divergenciaFalsa({ ocorrenciaIxcId: 2, auditorIxcId: 30 }),
        divergenciaFalsa({ ocorrenciaIxcId: 3, auditorIxcId: 31 }),
        divergenciaFalsa({ ocorrenciaIxcId: 4, auditorIxcId: null }),
      ],
      nomes: new Map([
        [30, "Pamela"],
        [31, "Luana"],
      ]),
    });

    const dados = await service.listar(PERIODO);

    assert.deepEqual(idsRecebidos, [[30, 31]]);
    assert.deepEqual(
      dados.map((divergencia) => divergencia.auditorNome),
      ["Pamela", "Pamela", "Luana", null],
    );
  });

  it("nao consulta operadores quando nenhuma divergencia tem auditor", async () => {
    const { service, idsRecebidos } = montarService({
      divergencias: [divergenciaFalsa({ auditorIxcId: null })],
    });

    await service.listar(PERIODO);

    assert.deepEqual(idsRecebidos, [[]]);
  });

});
