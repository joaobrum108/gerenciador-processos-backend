import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  criarRegistrosDevolucaoService,
  formatarMac,
  normalizarCodigo,
  normalizarSerial,
} from "../src/services/registros-devolucao.service.ts";

const ATOR = { usuarioId: "11111111-1111-1111-1111-111111111111" };

function dadosValidos(sobrescrever: Record<string, unknown> = {}) {
  return {
    dataRetirada: "2026-09-06",
    dataDevolucao: null,
    funcionarioIxcId: "123",
    funcionarioNomeSnapshot: "Fulano",
    baseIxcId: "4",
    baseNomeSnapshot: "Base Centro",
    classeNomeSnapshot: "TEC I",
    clienteIxcId: "99",
    clienteCodigoSnapshot: "10045",
    clienteNomeSnapshot: "ACME",
    modeloIxcId: "7",
    modeloNomeSnapshot: "ONU XPTO",
    mac: "aa:bb:cc:dd:ee:ff",
    serialNumber: " abc-123 ",
    motivoId: "22222222-2222-2222-2222-222222222222",
    paradeiroId: "33333333-3333-3333-3333-333333333333",
    recebimento: "PENDENTE",
    status: "PENDENTE",
    observacao: null,
    ...sobrescrever,
  };
}

function montarService(opcoes: {
  pendenteExistente?: { id: string } | null;
  registro?: Record<string, unknown> | null;
  lista?: Record<string, unknown>[];
  total?: number;
} = {}) {
  const inseridos: Record<string, unknown>[] = [];
  const excluidos: { id: string; usuarioId: string; motivo: string }[] = [];
  const checagensDuplicado: (string | null)[] = [];

  const service = criarRegistrosDevolucaoService({
    repositorio: {
      listar: async () => opcoes.lista ?? [],
      contar: async () => opcoes.total ?? 0,
      buscarPorId: async () =>
        opcoes.registro === undefined ? null : opcoes.registro,
      buscarPendentePorMacOuSerial: async (
        _mac: string,
        _serial: string,
        ignorarId: string | null,
      ) => {
        checagensDuplicado.push(ignorarId);
        return opcoes.pendenteExistente ?? null;
      },
      inserir: async (dados: Record<string, unknown>) => {
        inseridos.push(dados);
        return { id: "novo", ...dados };
      },
      atualizar: async (id: string, dados: Record<string, unknown>) => ({
        id,
        ...dados,
      }),
      excluirLogico: async (id: string, usuarioId: string, motivo: string) => {
        excluidos.push({ id, usuarioId, motivo });
        return true;
      },
    } as never,
  });

  return { service, inseridos, excluidos, checagensDuplicado };
}

describe("normalizacao de identificadores", () => {
  it("remove separadores do MAC e maiusculiza", () => {
    assert.equal(normalizarCodigo("aa:bb:cc:dd:ee:ff"), "AABBCCDDEEFF");
  });

  it("formata o MAC normalizado com dois pontos", () => {
    assert.equal(formatarMac("AABBCCDDEEFF"), "AA:BB:CC:DD:EE:FF");
  });

  it("maiusculiza o serial e remove espacos nas pontas", () => {
    assert.equal(normalizarSerial("  abc-123 "), "ABC-123");
  });

  it("remove tambem os espacos no meio do serial", () => {
    assert.equal(normalizarSerial("itbs 5566 7788"), "ITBS55667788");
  });
});

describe("criar registro de devolucao", () => {
  it("grava o MAC formatado e o serial normalizado", async () => {
    const { service, inseridos } = montarService();

    await service.criar(dadosValidos(), ATOR);

    assert.equal(inseridos[0]?.mac, "AA:BB:CC:DD:EE:FF");
    assert.equal(inseridos[0]?.serialNumber, "ABC-123");
  });

  it("usa o usuario autenticado como auditor e criador", async () => {
    const { service, inseridos } = montarService();

    await service.criar(dadosValidos(), ATOR);

    assert.equal(inseridos[0]?.auditorUsuarioId, ATOR.usuarioId);
    assert.equal(inseridos[0]?.criadoPorUsuarioId, ATOR.usuarioId);
  });

  it("marca como nao conciliado quando o modelo nao veio do IXC", async () => {
    const { service, inseridos } = montarService();

    await service.criar(dadosValidos({ modeloIxcId: null }), ATOR);

    assert.equal(inseridos[0]?.conciliadoIxc, false);
  });

  it("marca como conciliado quando o modelo veio do IXC", async () => {
    const { service, inseridos } = montarService();

    await service.criar(dadosValidos(), ATOR);

    assert.equal(inseridos[0]?.conciliadoIxc, true);
  });

  it("recusa MAC que nao tenha 12 hexadecimais", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(dadosValidos({ mac: "ZZ:99" }), ATOR),
      /MAC/i,
    );
  });

  it("recusa serial fora do formato aceito", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(dadosValidos({ serialNumber: "ab" }), ATOR),
      /serial/i,
    );
  });

  it("recusa codigo de cliente que nao seja numerico", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(dadosValidos({ clienteCodigoSnapshot: "abc" }), ATOR),
      /cliente/i,
    );
  });

  it("recusa data de devolucao anterior a data de retirada", async () => {
    const { service } = montarService();

    await assert.rejects(
      () => service.criar(dadosValidos({ dataDevolucao: "2026-09-05" }), ATOR),
      /devolu/i,
    );
  });

  it("recusa duplicado quando ja existe pendente com mesmo MAC ou serial", async () => {
    const { service } = montarService({ pendenteExistente: { id: "outro" } });

    await assert.rejects(
      () => service.criar(dadosValidos(), ATOR),
      /pendente/i,
    );
  });

  it("aceita quando nao ha pendente com o mesmo equipamento", async () => {
    const { service, inseridos } = montarService({ pendenteExistente: null });

    await service.criar(dadosValidos(), ATOR);

    assert.equal(inseridos.length, 1);
  });
});

describe("listar registros de devolucao", () => {
  it("devolve os dados e o total separados, para a paginacao", async () => {
    const { service } = montarService({
      lista: [{ id: "a" }, { id: "b" }],
      total: 57,
    });

    const resultado = await service.listar(
      {},
      { ordenarPor: "dataRetirada", ordem: "desc", pagina: 1, porPagina: 25 },
    );

    assert.equal(resultado.dados.length, 2);
    assert.equal(resultado.total, 57);
  });
});

describe("atualizar registro de devolucao", () => {
  it("recusa registro inexistente ou ja excluido", async () => {
    const { service } = montarService({ registro: null });

    await assert.rejects(
      () => service.atualizar("sumido", dadosValidos(), ATOR),
      /encontrad/i,
    );
  });

  it("ignora o proprio registro ao checar equipamento duplicado", async () => {
    const { service, checagensDuplicado } = montarService({
      registro: { id: "abc" },
    });

    await service.atualizar("abc", dadosValidos(), ATOR);

    assert.deepEqual(checagensDuplicado, ["abc"]);
  });

  it("nao checa duplicado contra o proprio registro ao criar", async () => {
    const { service, checagensDuplicado } = montarService();

    await service.criar(dadosValidos(), ATOR);

    assert.deepEqual(checagensDuplicado, [null]);
  });
});

describe("excluir registro de devolucao", () => {
  it("preenche o motivo automaticamente, sem exigir do chamador", async () => {
    const { service, excluidos } = montarService({ registro: { id: "abc" } });

    await service.excluir("abc", ATOR);

    assert.equal(excluidos[0]?.id, "abc");
    assert.equal(excluidos[0]?.usuarioId, ATOR.usuarioId);
    assert.ok((excluidos[0]?.motivo ?? "").length > 0);
  });

  it("responde nao encontrado quando o registro ja foi excluido", async () => {
    const { service } = montarService({ registro: null });

    await assert.rejects(() => service.excluir("sumido", ATOR), /encontrad/i);
  });
});
