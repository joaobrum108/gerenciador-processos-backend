import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarAgendamentosService } from "../src/services/agendamentos.service.ts";

const ATOR = { usuarioId: "11111111-1111-1111-1111-111111111111" };

function entradaValida(sobrescrever: Record<string, unknown> = {}) {
  return {
    setor: "CONFERENCIA",
    tipo: "DIARIO",
    data: "2026-09-10",
    hora: "08:00",
    tecnicos: [
      { ixcId: "481", nome: "JOAO DA SILVA", sigla: "JS" },
      { ixcId: "512", nome: "CARLOS PEREIRA", sigla: null },
    ],
    baseIxcId: "4",
    baseNomeSnapshot: "BASE PIMENTAS",
    observacoes: null,
    ...sobrescrever,
  };
}

function montarService(opcoes: {
  slotOcupado?: boolean;
  registro?: Record<string, unknown> | null;
} = {}) {
  const inseridos: Record<string, unknown>[] = [];
  const statusGravados: Record<string, unknown>[] = [];
  const reagendados: Record<string, unknown>[] = [];

  const service = criarAgendamentosService({
    repositorio: {
      listar: async () => [],
      buscarPorId: async () =>
        opcoes.registro === undefined
          ? { id: "abc", status: "AGENDADO", setor: "CONFERENCIA" }
          : opcoes.registro,
      buscarSlotOcupado: async () =>
        opcoes.slotOcupado === true ? { id: "outro" } : null,
      inserirVarios: async (dados: Record<string, unknown>[]) => {
        inseridos.push(...dados);
        return dados.map((item, indice) => ({ id: `novo-${indice}`, ...item }));
      },
      atualizarDataHora: async (
        id: string,
        data: string,
        hora: string,
      ) => {
        reagendados.push({ id, data, hora });
        return { id, data, hora };
      },
      atualizarStatus: async (
        id: string,
        status: string,
        cancelamento: Record<string, unknown> | null,
      ) => {
        statusGravados.push({ id, status, cancelamento });
        return { id, status };
      },
    } as never,
  });

  return { service, inseridos, statusGravados, reagendados };
}

describe("criar agendamentos", () => {
  it("gera um agendamento por tecnico informado", async () => {
    const { service, inseridos } = montarService();

    const criados = await service.criar(entradaValida(), ATOR);

    assert.equal(inseridos.length, 2);
    assert.equal(criados.length, 2);
  });

  it("leva o codigo e o nome do tecnico para os campos de snapshot", async () => {
    const { service, inseridos } = montarService();

    await service.criar(entradaValida(), ATOR);

    assert.equal(inseridos[0]?.tecnicoIxcId, "481");
    assert.equal(inseridos[0]?.tecnicoNomeSnapshot, "JOAO DA SILVA");
    assert.equal(inseridos[0]?.tecnicoSiglaSnapshot, "JS");
  });

  it("registra quem criou a partir do usuario autenticado", async () => {
    const { service, inseridos } = montarService();

    await service.criar(entradaValida(), ATOR);

    assert.equal(inseridos[0]?.criadoPorUsuarioId, ATOR.usuarioId);
  });

  it("recusa quando o tecnico ja tem agendamento no mesmo horario", async () => {
    const { service } = montarService({ slotOcupado: true });

    await assert.rejects(
      () => service.criar(entradaValida(), ATOR),
      /horario/i,
    );
  });

  it("recusa lista de tecnicos vazia", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(entradaValida({ tecnicos: [] }), ATOR),
      /tecnico/i,
    );
  });

  it("recusa hora fora do formato HH:MM", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(entradaValida({ hora: "8h" }), ATOR),
      /hora/i,
    );
  });
});

describe("alterar status do agendamento", () => {
  it("grava status comum sem tocar nos campos de cancelamento", async () => {
    const { service, statusGravados } = montarService();

    await service.alterarStatus("abc", { status: "REALIZADO" }, ATOR);

    assert.equal(statusGravados[0]?.status, "REALIZADO");
    assert.equal(statusGravados[0]?.cancelamento, null);
  });

  it("exige motivo para cancelar", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.alterarStatus("abc", { status: "CANCELADO" }, ATOR),
      /motivo/i,
    );
  });

  it("recusa motivo em branco ao cancelar", async () => {
    const { service } = montarService();

    await assert.rejects(
      () =>
        service.alterarStatus(
          "abc",
          { status: "CANCELADO", motivo: "   " },
          ATOR,
        ),
      /motivo/i,
    );
  });

  it("guarda motivo e autor ao cancelar", async () => {
    const { service, statusGravados } = montarService();

    await service.alterarStatus(
      "abc",
      { status: "CANCELADO", motivo: "tecnico de folga" },
      ATOR,
    );

    assert.deepEqual(statusGravados[0]?.cancelamento, {
      canceladoPorUsuarioId: ATOR.usuarioId,
      motivo: "tecnico de folga",
    });
  });

  it("nao deixa reativar um agendamento ja cancelado", async () => {
    const { service } = montarService({
      registro: { id: "abc", status: "CANCELADO", setor: "CONFERENCIA" },
    });

    await assert.rejects(
      () => service.alterarStatus("abc", { status: "AGENDADO" }, ATOR),
      /cancelad/i,
    );
  });

  it("responde nao encontrado quando o agendamento nao existe", async () => {
    const { service } = montarService({ registro: null });

    await assert.rejects(
      () => service.alterarStatus("sumido", { status: "REALIZADO" }, ATOR),
      /encontrad/i,
    );
  });
});

describe("reagendar", () => {
  it("grava a nova data e hora", async () => {
    const { service, reagendados } = montarService();

    await service.reagendar("abc", { data: "2026-09-11", hora: "09:30" }, ATOR);

    assert.deepEqual(reagendados[0], {
      id: "abc",
      data: "2026-09-11",
      hora: "09:30",
    });
  });

  it("recusa quando o destino ja esta ocupado", async () => {
    const { service } = montarService({ slotOcupado: true });

    await assert.rejects(
      () =>
        service.reagendar("abc", { data: "2026-09-11", hora: "09:30" }, ATOR),
      /horario/i,
    );
  });

  it("recusa hora invalida", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.reagendar("abc", { hora: "25:00" }, ATOR),
      /hora/i,
    );
  });

  it("recusa reagendar um cancelado", async () => {
    const { service } = montarService({
      registro: { id: "abc", status: "CANCELADO", setor: "CONFERENCIA" },
    });

    await assert.rejects(
      () => service.reagendar("abc", { data: "2026-09-11" }, ATOR),
      /cancelad/i,
    );
  });
});
