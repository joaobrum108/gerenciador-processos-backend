import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarAuditoriasService } from "../src/services/services.auditorias.ixc.ts";
import type {
  AuditoriaIxc,
  PeriodoAuditorias,
} from "../src/repositories/repositorio.auditorias.ixc.ts";

const PERIODO = { dataInicio: "2026-08-27", dataFim: "2026-08-29" };

function auditoriaFalsa(
  sobrescritas: Partial<AuditoriaIxc> = {},
): AuditoriaIxc {
  return {
    ocorrenciaIxcId: 1,
    chamadoIxcId: 10,
    clienteIxcId: 1000,
    clienteNome: "Cliente Teste",
    assunto: "AUDITORIA REPARO RESIDENCIAL",
    auditorIxcId: 20,
    auditorNome: "PAMELA EVELYN DA SILVA",
    operadorIxcId: 30,
    diagnostico: "AUDITORIA CONCLUIDA",
    mensagem: "Servico conferido",
    tarefa: "FINALIZADO",
    statusOcorrencia: "F",
    abertoEm: "27/08/2026 09:00:00",
    fechadoEm: "27/08/2026 11:00:00",
    ...sobrescritas,
  };
}

function montarService(auditorias: AuditoriaIxc[]) {
  const periodosRecebidos: PeriodoAuditorias[] = [];

  const service = criarAuditoriasService({
    repositorioAuditorias: {
      listar: async (periodo: PeriodoAuditorias) => {
        periodosRecebidos.push(periodo);
        return auditorias;
      },
    } as never,
  });

  return { service, periodosRecebidos };
}

describe("auditorias.service", () => {
  it("marca toda linha como aprovada sem divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({ ocorrenciaIxcId: 1 }),
      auditoriaFalsa({ ocorrenciaIxcId: 2 }),
    ]);

    const dados = await service.listar(PERIODO);

    assert.deepEqual(
      dados.map((auditoria) => auditoria.resultado),
      ["APROVADA_SEM_DIVERGENCIA", "APROVADA_SEM_DIVERGENCIA"],
    );
  });

  it("preserva os campos vindos do repositorio", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        ocorrenciaIxcId: 77,
        auditorIxcId: 5,
        auditorNome: "DAVI RODRIGUES DE CARVALHO",
        operadorIxcId: 924,
        assunto: "AUDITORIA INSTALACAO RESIDENCIAL",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.ocorrenciaIxcId, 77);
    assert.equal(auditoria?.auditorIxcId, 5);
    assert.equal(auditoria?.auditorNome, "DAVI RODRIGUES DE CARVALHO");
    assert.equal(auditoria?.operadorIxcId, 924);
    assert.equal(auditoria?.assunto, "AUDITORIA INSTALACAO RESIDENCIAL");
    assert.equal(auditoria?.fechadoEm, "27/08/2026 11:00:00");
  });

  it("repassa o periodo recebido sem alterar", async () => {
    const { service, periodosRecebidos } = montarService([]);

    await service.listar(PERIODO);

    assert.deepEqual(periodosRecebidos, [PERIODO]);
  });

  it("devolve lista vazia quando o periodo nao tem auditorias", async () => {
    const { service } = montarService([]);

    assert.deepEqual(await service.listar(PERIODO), []);
  });

  it("aceita colunas nulas vindas dos LEFT JOIN", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        clienteIxcId: null,
        clienteNome: null,
        assunto: null,
        auditorIxcId: null,
        auditorNome: null,
        operadorIxcId: null,
        diagnostico: null,
        mensagem: null,
        tarefa: null,
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.auditorNome, null);
    assert.equal(auditoria?.resultado, "APROVADA_SEM_DIVERGENCIA");
  });
});
