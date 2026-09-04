import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS_JANELA_RELEITURA,
  FOLGA_MARCA_DAGUA_MINUTOS,
  INICIO_HISTORICO_PADRAO,
  criarSincronizacaoService,
  fatiarPorMes,
  inicioDoHistorico,
  planejar,
  unificar,
} from "../src/services/services.sincronizacao.ixc.ts";
import type { OcorrenciaBruta } from "../src/repositories/repositorio.sincronizacao.ixc.ts";

const AGORA = new Date("2026-09-04T15:00:00.000Z");

function ocorrenciaFalsa(
  sobrescritas: Partial<OcorrenciaBruta> = {},
): OcorrenciaBruta {
  return {
    ocorrenciaIxcId: 1,
    chamadoIxcId: 10,
    ticketIxcId: 100,
    setorSnapshot: "AUDITORIA DE SERVIÇOS",
    operadorIxcId: 430,
    auditorNomeSnapshot: "PAMELA EVELYN DA SILVA",
    funcionarioIxcId: 94016,
    funcionarioNomeSnapshot: "PAMELA EVELYN DA SILVA",
    tecnicoIxcId: null,
    tecnicoNomeSnapshot: null,
    assuntoIxcId: 398,
    assuntoSnapshot: "AUDITORIA REPARO RESIDENCIAL #",
    tituloOsSnapshot: null,
    diagnosticoIxcId: 5,
    diagnosticoSnapshot: "AUDITORIA CONCLUIDA",
    tarefaSnapshot: null,
    tarefaChamadoSnapshot: null,
    mensagem: "AUDITORIA DE O.S CONCLUIDA COM SUCESSO",
    clienteIxcId: 1000,
    clienteNomeSnapshot: "CLIENTE TESTE",
    statusOcorrencia: "F",
    abertoEm: new Date("2026-09-03T10:00:00.000Z"),
    fechadoEm: new Date("2026-09-04T11:00:00.000Z"),
    ...sobrescritas,
  };
}

function montarService(opcoes: {
  marcaDagua?: Date | null;
  porFechamento?: OcorrenciaBruta[];
  porAtualizacao?: OcorrenciaBruta[];
  falharAoGravar?: boolean;
  espelhoVazio?: boolean;
}) {
  const chamadas = {
    fechamento: [] as unknown[],
    atualizacao: [] as unknown[],
    gravadas: [] as OcorrenciaBruta[],
    concluidas: [] as unknown[],
    falhadas: [] as unknown[],
  };

  const service = criarSincronizacaoService({
    agora: () => AGORA,
    repositorioIxc: {
      lerPorFechamento: async (janela: unknown) => {
        chamadas.fechamento.push(janela);
        return opcoes.porFechamento ?? [];
      },
      lerPorAtualizacao: async (janela: unknown) => {
        chamadas.atualizacao.push(janela);
        return opcoes.porAtualizacao ?? [];
      },
    } as never,
    repositorioEspelho: {
      ultimaMarcaDagua: async () => opcoes.marcaDagua ?? null,
      contarEspelho: async () => opcoes.espelhoVazio === true ? 0 : 42,
      abrirCorrida: async () => "corrida-1",
      gravar: async (ocorrencias: OcorrenciaBruta[]) => {
        if (opcoes.falharAoGravar === true) throw new Error("banco fora");
        chamadas.gravadas.push(...ocorrencias);
        return ocorrencias.length;
      },
      concluirCorrida: async (...args: unknown[]) => {
        chamadas.concluidas.push(args);
      },
      falharCorrida: async (...args: unknown[]) => {
        chamadas.falhadas.push(args);
      },
    } as never,
  });

  return { service, chamadas };
}

describe("sincronizacao.planejar", () => {
  it("sem marca dagua anterior faz apenas a carga da janela de releitura", () => {
    const plano = planejar(null, AGORA);

    assert.equal(plano.incremental, null);
    assert.equal(plano.marcaDaguaAte.getTime(), AGORA.getTime());
  });

  it("a janela de releitura cobre os dias configurados", () => {
    const plano = planejar(null, AGORA);

    const dias =
      (plano.releitura.ate.getTime() - plano.releitura.desde.getTime()) /
      86_400_000;

    assert.equal(Math.round(dias), DIAS_JANELA_RELEITURA);
  });

  it("com marca dagua anterior monta o incremental com folga para tras", () => {
    const anterior = new Date("2026-09-04T14:00:00.000Z");
    const plano = planejar(anterior, AGORA);

    const folga =
      (anterior.getTime() - plano.incremental!.desde.getTime()) / 60_000;

    assert.equal(folga, FOLGA_MARCA_DAGUA_MINUTOS);
    assert.equal(plano.incremental!.ate.getTime(), AGORA.getTime());
  });

  it("aceita janela de releitura customizada", () => {
    const plano = planejar(null, AGORA, 7);

    const dias =
      (plano.releitura.ate.getTime() - plano.releitura.desde.getTime()) /
      86_400_000;

    assert.equal(Math.round(dias), 7);
  });

  it("ignora marca dagua no futuro em vez de montar janela invertida", () => {
    const futuro = new Date("2026-09-05T02:59:59.000Z");
    const plano = planejar(futuro, AGORA);

    assert.equal(plano.incremental, null);
  });

  it("ignora marca dagua igual ao agora", () => {
    assert.equal(planejar(AGORA, AGORA).incremental, null);
  });
});

describe("sincronizacao.inicioDoHistorico", () => {
  it("usa o padrao quando nao ha variavel configurada", () => {
    assert.equal(
      inicioDoHistorico("").toISOString().slice(0, 10),
      INICIO_HISTORICO_PADRAO,
    );
  });

  it("aceita a data configurada", () => {
    assert.equal(
      inicioDoHistorico("2024-06-01").toISOString().slice(0, 10),
      "2024-06-01",
    );
  });

  it("cai no padrao quando a data configurada e invalida", () => {
    assert.equal(
      inicioDoHistorico("nao-e-data").toISOString().slice(0, 10),
      INICIO_HISTORICO_PADRAO,
    );
  });
});

describe("sincronizacao.sincronizarTudo", () => {
  it("com espelho vazio carrega o historico antes do incremental", async () => {
    const { service } = montarService({ espelhoVazio: true, marcaDagua: null });

    const r = await service.sincronizarTudo();

    assert.notEqual(r.historico, null);
  });

  it("com espelho populado nao carrega historico", async () => {
    const { service } = montarService({ espelhoVazio: false, marcaDagua: null });

    const r = await service.sincronizarTudo();

    assert.equal(r.historico, null);
  });
});

describe("sincronizacao.fatiarPorMes", () => {
  it("quebra um intervalo de tres meses em tres fatias", () => {
    const fatias = fatiarPorMes({
      desde: new Date(2026, 5, 10),
      ate: new Date(2026, 7, 20, 23, 59, 59),
    });

    assert.equal(fatias.length, 3);
    assert.equal(fatias[0]?.desde.getMonth(), 5);
    assert.equal(fatias[2]?.desde.getMonth(), 7);
  });

  it("a primeira fatia comeca na data pedida, nao no dia 1", () => {
    const fatias = fatiarPorMes({
      desde: new Date(2026, 5, 10),
      ate: new Date(2026, 6, 5),
    });

    assert.equal(fatias[0]?.desde.getDate(), 10);
  });

  it("a ultima fatia termina na data pedida", () => {
    const ate = new Date(2026, 6, 5, 23, 59, 59);
    const fatias = fatiarPorMes({ desde: new Date(2026, 5, 10), ate });

    assert.equal(fatias.at(-1)?.ate.getTime(), ate.getTime());
  });

  it("intervalo dentro de um mes so vira uma fatia", () => {
    const fatias = fatiarPorMes({
      desde: new Date(2026, 5, 10),
      ate: new Date(2026, 5, 20),
    });

    assert.equal(fatias.length, 1);
  });

  it("as fatias nao se sobrepoem nem deixam buraco", () => {
    const fatias = fatiarPorMes({
      desde: new Date(2026, 0, 15),
      ate: new Date(2026, 3, 10, 23, 59, 59),
    });

    for (let i = 1; i < fatias.length; i += 1) {
      const anterior = fatias[i - 1]!;
      const atual = fatias[i]!;
      assert.equal(atual.desde.getTime() - anterior.ate.getTime(), 1);
    }
  });
});

describe("sincronizacao.unificar", () => {
  it("remove ocorrencia repetida entre os lotes", () => {
    const unificadas = unificar(
      [ocorrenciaFalsa({ ocorrenciaIxcId: 1 }), ocorrenciaFalsa({ ocorrenciaIxcId: 2 })],
      [ocorrenciaFalsa({ ocorrenciaIxcId: 2 }), ocorrenciaFalsa({ ocorrenciaIxcId: 3 })],
    );

    assert.deepEqual(
      unificadas.map((o) => o.ocorrenciaIxcId).sort(),
      [1, 2, 3],
    );
  });

  it("o lote posterior vence quando a ocorrencia se repete", () => {
    const unificadas = unificar(
      [ocorrenciaFalsa({ ocorrenciaIxcId: 1, diagnosticoSnapshot: "ANTIGO" })],
      [ocorrenciaFalsa({ ocorrenciaIxcId: 1, diagnosticoSnapshot: "NOVO" })],
    );

    assert.equal(unificadas.length, 1);
    assert.equal(unificadas[0]?.diagnosticoSnapshot, "NOVO");
  });
});

describe("sincronizacao.sincronizar", () => {
  it("na primeira corrida nao consulta por atualizacao", async () => {
    const { service, chamadas } = montarService({
      marcaDagua: null,
      porFechamento: [ocorrenciaFalsa()],
    });

    const resultado = await service.sincronizar();

    assert.equal(chamadas.atualizacao.length, 0);
    assert.equal(chamadas.fechamento.length, 1);
    assert.equal(resultado.gravadas, 1);
  });

  it("nas corridas seguintes consulta as duas janelas", async () => {
    const { service, chamadas } = montarService({
      marcaDagua: new Date("2026-09-04T14:00:00.000Z"),
      porFechamento: [ocorrenciaFalsa({ ocorrenciaIxcId: 1 })],
      porAtualizacao: [ocorrenciaFalsa({ ocorrenciaIxcId: 2 })],
    });

    const resultado = await service.sincronizar();

    assert.equal(chamadas.fechamento.length, 1);
    assert.equal(chamadas.atualizacao.length, 1);
    assert.equal(resultado.lidas, 2);
    assert.equal(resultado.gravadas, 2);
  });

  it("nao grava duas vezes a ocorrencia que aparece nas duas janelas", async () => {
    const { service, chamadas } = montarService({
      marcaDagua: new Date("2026-09-04T14:00:00.000Z"),
      porFechamento: [ocorrenciaFalsa({ ocorrenciaIxcId: 7 })],
      porAtualizacao: [ocorrenciaFalsa({ ocorrenciaIxcId: 7 })],
    });

    const resultado = await service.sincronizar();

    assert.equal(resultado.lidas, 2);
    assert.equal(resultado.gravadas, 1);
    assert.equal(chamadas.gravadas.length, 1);
  });

  it("marca a corrida como falha quando a gravacao quebra", async () => {
    const { service, chamadas } = montarService({
      marcaDagua: null,
      porFechamento: [ocorrenciaFalsa()],
      falharAoGravar: true,
    });

    await assert.rejects(() => service.sincronizar(), /banco fora/);

    assert.equal(chamadas.falhadas.length, 1);
    assert.equal(chamadas.concluidas.length, 0);
  });
});
