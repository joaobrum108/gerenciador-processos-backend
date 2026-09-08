import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularAtraso,
  criarRegistrosPontoService,
  definirStatus,
  minutosDe,
} from "../src/services/registros-ponto.service.ts";
import { ErroConflito, ErroValidacao } from "../src/erros.ts";

function montarService(opcoes: {
  usuario?: { id: string; nomeExibicao: string; entradaExpediente: string | null } | null;
  duplicado?: boolean;
}) {
  const gravados: unknown[] = [];

  const service = criarRegistrosPontoService({
    repositorio: {
      listar: async () => [],
      listarColaboradoresComJornada: async () => [],
      buscar: async () => null,
      buscarPorUsuarioEData: async () =>
        opcoes.duplicado === true ? { id: "existe-1" } : null,
      criar: async (dados: unknown) => {
        gravados.push(dados);
        return { id: "novo-1" };
      },
      atualizar: async () => ({ id: "novo-1" }),
      remover: async () => true,
    } as never,
    usuariosRepositorio: {
      buscarPorId: async () =>
        opcoes.usuario === undefined
          ? { id: "u1", nomeExibicao: "Ana", entradaExpediente: "08:00" }
          : opcoes.usuario,
    } as never,
  });

  return { service, gravados };
}

describe("registros de ponto", () => {
  it("converte hora em minutos", () => {
    assert.equal(minutosDe("08:00"), 480);
    assert.equal(minutosDe("13:12"), 792);
  });

  it("calcula o atraso contra a jornada do usuario", () => {
    assert.equal(calcularAtraso("08:17", "08:00"), 17);
    assert.equal(calcularAtraso("09:30", "08:00"), 90);
  });

  it("chegar antes da hora nao vira credito", () => {
    assert.equal(calcularAtraso("07:40", "08:00"), 0);
  });

  it("sem jornada cadastrada nao acusa atraso", () => {
    assert.equal(calcularAtraso("09:00", null), 0);
  });

  it("classifica o status pelo atraso e pela ausencia", () => {
    assert.equal(definirStatus("08:00", 0, null), "NO_HORARIO");
    assert.equal(definirStatus("08:20", 20, null), "ATRASO");
    assert.equal(definirStatus(null, 0, null), "FALTA");
    assert.equal(definirStatus(null, 0, "Atestado medico"), "JUSTIFICADO");
  });

  it("grava o atraso calculado quando nao vem informado", async () => {
    const { service, gravados } = montarService({});

    await service.criar({ usuarioId: "u1", data: "2026-09-08", entrada: "08:25" }, "ator-1");

    assert.equal((gravados[0] as { atrasoMinutos: number }).atrasoMinutos, 25);
    assert.equal((gravados[0] as { status: string }).status, "ATRASO");
  });

  it("respeita o atraso informado manualmente", async () => {
    const { service, gravados } = montarService({});

    await service.criar(
      { usuarioId: "u1", data: "2026-09-08", entrada: "08:25", atrasoMinutos: 5 },
      "ator-1",
    );

    assert.equal((gravados[0] as { atrasoMinutos: number }).atrasoMinutos, 5);
  });

  it("recusa dois registros do mesmo colaborador no mesmo dia", async () => {
    const { service } = montarService({ duplicado: true });

    await assert.rejects(
      () => service.criar({ usuarioId: "u1", data: "2026-09-08", entrada: "08:00" }, null),
      ErroConflito,
    );
  });

  it("recusa justificado sem justificativa", async () => {
    const { service } = montarService({});

    await assert.rejects(
      () =>
        service.criar(
          { usuarioId: "u1", data: "2026-09-08", entrada: null, status: "JUSTIFICADO" },
          null,
        ),
      ErroValidacao,
    );
  });

  it("recusa falta com horario de entrada", async () => {
    const { service } = montarService({});

    await assert.rejects(
      () =>
        service.criar(
          { usuarioId: "u1", data: "2026-09-08", entrada: "08:00", status: "FALTA" },
          null,
        ),
      ErroValidacao,
    );
  });

  it("recusa colaborador inexistente", async () => {
    const { service } = montarService({ usuario: null });

    await assert.rejects(
      () => service.criar({ usuarioId: "u9", data: "2026-09-08", entrada: "08:00" }, null),
      ErroValidacao,
    );
  });
});
