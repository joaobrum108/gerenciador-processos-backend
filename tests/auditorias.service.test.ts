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
      contar: async (periodo: PeriodoAuditorias) => {
        periodosRecebidos.push(periodo);
        return auditorias.length;
      },
      resumir: async (periodo: PeriodoAuditorias) => {
        periodosRecebidos.push(periodo);
        return {
          grupos: auditorias.map((auditoria) => ({
            operadorIxcId: auditoria.operadorIxcId,
            auditorNome: auditoria.auditorNome,
            assunto: auditoria.assunto,
            diagnostico: auditoria.diagnostico,
            tarefa: auditoria.tarefa,
            total: 1,
          })),
          intervalos: [],
        };
      },
    } as never,
  });

  return { service, periodosRecebidos };
}

describe("auditorias.service", () => {
  it("marca como aprovada quando a proxima tarefa nao leva a divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({ tarefa: "4 - APROVADO - TAXA ISENTA CORRETAMENTE" }),
      auditoriaFalsa({ tarefa: "AUDITORIA DE DOCUMENTO E SELFIE - APROVADA" }),
      auditoriaFalsa({ tarefa: "NAO HOUVE TROCA DE EQUIPAMENTO" }),
    ]);

    const dados = await service.listar(PERIODO);

    assert.deepEqual(
      dados.map((auditoria) => auditoria.resultado),
      [
        "APROVADA_SEM_DIVERGENCIA",
        "APROVADA_SEM_DIVERGENCIA",
        "APROVADA_SEM_DIVERGENCIA",
      ],
    );
  });

  it("marca como divergente quando a proxima tarefa e a de divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({ tarefa: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ tarefa: "DIVERGENCIA DE O.S | NAO HOUVE TROCA DE EQUIPAMENTO" }),
      auditoriaFalsa({ tarefa: "DIVERGENCIA DE O.S | CONFERENCIA - TROCA EQUIPAMENTO" }),
    ]);

    const dados = await service.listar(PERIODO);

    assert.deepEqual(
      dados.map((auditoria) => auditoria.resultado),
      ["COM_DIVERGENCIA", "COM_DIVERGENCIA", "COM_DIVERGENCIA"],
    );
  });

  it("reconhece a divergencia mesmo com o acento que o IXC usa em parte das tarefas", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        tarefa: "4.1 - DIVERGÊNCIA DE O.S | APROVADO - TAXA ISENTA CORRETAMENTE",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "COM_DIVERGENCIA");
  });

  it("nao confunde SEM DIVERGENCIA com a tarefa de divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({ tarefa: "SEM DIVERGENCIA | SEM TROCA" }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "APROVADA_SEM_DIVERGENCIA");
  });

  it("marca como divergente quando o assunto ja e o de divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        assunto: "DIVERGENCIA DE O.S",
        tarefa: null,
        diagnostico: "AUDITORIA CONCLUIDA",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "COM_DIVERGENCIA");
  });

  it("marca como divergente a auditoria reprovada", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        assunto: "AUDITORIA DE DOCUMENTO E SELFIE",
        tarefa: "AUDITORIA DE DOCUMENTO E SELFIE - REPROVADA",
        diagnostico: "NAO ANEXOU DOCUMENTO",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "COM_DIVERGENCIA");
  });

  it("nao confunde a auditoria aprovada com a reprovada", async () => {
    const { service } = montarService([
      auditoriaFalsa({ tarefa: "AUDITORIA DE DOCUMENTO E SELFIE - APROVADA" }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "APROVADA_SEM_DIVERGENCIA");
  });

  it("marca como divergente a reprovacao no masculino", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        tarefa: "1 - REPROVADO - TAXA DE INSTALACAO COM VALOR DIVERGENTE ",
        diagnostico: "1 - REPROVADO -  TAXA DE INSTALACAO COM VALOR DIVERGENTE  ",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "COM_DIVERGENCIA");
  });

  it("marca como divergente quando so o diagnostico traz a reprovacao", async () => {
    const { service } = montarService([
      auditoriaFalsa({
        tarefa: null,
        diagnostico: "1 - REPROVADO - TAXA DE INSTALACAO COM VALOR DIVERGENTE",
      }),
    ]);

    const [auditoria] = await service.listar(PERIODO);

    assert.equal(auditoria?.resultado, "COM_DIVERGENCIA");
  });

  it("nao confunde as tres formas de negar divergencia", async () => {
    const { service } = montarService([
      auditoriaFalsa({ tarefa: "SEM DIVERGENCIA | SEM TROCA" }),
      auditoriaFalsa({ tarefa: "NÃO HOUVE DIVERGENCIAS" }),
      auditoriaFalsa({ tarefa: null, diagnostico: "SEM DIVERGÊNCIAS" }),
    ]);

    const dados = await service.listar(PERIODO);

    assert.deepEqual(
      dados.map((auditoria) => auditoria.resultado),
      [
        "APROVADA_SEM_DIVERGENCIA",
        "APROVADA_SEM_DIVERGENCIA",
        "APROVADA_SEM_DIVERGENCIA",
      ],
    );
  });

  it("nao descarta nenhuma linha ao classificar", async () => {
    const { service } = montarService([
      auditoriaFalsa({ ocorrenciaIxcId: 1, tarefa: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ ocorrenciaIxcId: 2, tarefa: null }),
      auditoriaFalsa({ ocorrenciaIxcId: 3, tarefa: "SEM DIVERGENCIA | SEM TROCA" }),
    ]);

    const dados = await service.listar(PERIODO);

    assert.deepEqual(
      dados.map((auditoria) => auditoria.ocorrenciaIxcId),
      [1, 2, 3],
    );
  });

  it("contar devolve o total sem trazer as linhas", async () => {
    const { service } = montarService([
      auditoriaFalsa({ ocorrenciaIxcId: 1 }),
      auditoriaFalsa({ ocorrenciaIxcId: 2, tarefa: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ ocorrenciaIxcId: 3 }),
    ]);

    assert.equal(await service.contar(PERIODO), 3);
  });

  it("contar repassa o periodo sem alterar", async () => {
    const { service, periodosRecebidos } = montarService([]);

    await service.contar(PERIODO);

    assert.deepEqual(periodosRecebidos, [PERIODO]);
  });

  it("resumir soma os grupos aplicando a mesma regra de classificacao", async () => {
    const { service } = montarService([
      auditoriaFalsa({ operadorIxcId: 430, tarefa: null }),
      auditoriaFalsa({ operadorIxcId: 430, tarefa: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ operadorIxcId: 430, tarefa: "SEM DIVERGENCIA | SEM TROCA" }),
      auditoriaFalsa({ operadorIxcId: 507, tarefa: null }),
    ]);

    const resumo = await service.resumir(PERIODO);

    assert.equal(resumo.total, 4);
    assert.equal(resumo.aprovadas, 3);

    const pamela = resumo.porAuditor.find((a) => a.auditorId === 430);
    assert.equal(pamela?.total, 3);
    assert.equal(pamela?.aprovadas, 2);

    const luana = resumo.porAuditor.find((a) => a.auditorId === 507);
    assert.equal(luana?.total, 1);
    assert.equal(luana?.aprovadas, 1);
  });

  it("resumir e listar concordam no total e nas aprovadas", async () => {
    const linhas = [
      auditoriaFalsa({ ocorrenciaIxcId: 1, tarefa: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ ocorrenciaIxcId: 2, tarefa: null }),
      auditoriaFalsa({ ocorrenciaIxcId: 3, assunto: "DIVERGENCIA DE O.S" }),
      auditoriaFalsa({ ocorrenciaIxcId: 4, diagnostico: "1 - REPROVADO - TAXA" }),
      auditoriaFalsa({ ocorrenciaIxcId: 5, tarefa: "NÃO HOUVE DIVERGENCIAS" }),
    ];
    const { service } = montarService(linhas);

    const listadas = await service.listar(PERIODO);
    const resumo = await service.resumir(PERIODO);

    assert.equal(resumo.total, listadas.length);
    assert.equal(
      resumo.aprovadas,
      listadas.filter((a) => a.resultado === "APROVADA_SEM_DIVERGENCIA").length,
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
