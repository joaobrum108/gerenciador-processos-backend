import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INTERVALO_PADRAO_MINUTOS,
  agendadorAtivo,
  intervaloEmMinutos,
} from "../src/services/agendador.sincronizacao.ts";

describe("agendador.intervaloEmMinutos", () => {
  it("usa o padrao quando nao ha configuracao", () => {
    assert.equal(intervaloEmMinutos(undefined), INTERVALO_PADRAO_MINUTOS);
    assert.equal(intervaloEmMinutos(""), INTERVALO_PADRAO_MINUTOS);
  });

  it("aceita o valor configurado", () => {
    assert.equal(intervaloEmMinutos("30"), 30);
  });

  it("cai no padrao quando o valor nao e numero", () => {
    assert.equal(intervaloEmMinutos("quinze"), INTERVALO_PADRAO_MINUTOS);
  });

  it("cai no padrao quando o valor e zero ou negativo", () => {
    assert.equal(intervaloEmMinutos("0"), INTERVALO_PADRAO_MINUTOS);
    assert.equal(intervaloEmMinutos("-5"), INTERVALO_PADRAO_MINUTOS);
  });
});

describe("agendador.agendadorAtivo", () => {
  it("fica ativo por padrao", () => {
    assert.equal(agendadorAtivo(undefined), true);
    assert.equal(agendadorAtivo(""), true);
  });

  it("desliga apenas com false explicito", () => {
    assert.equal(agendadorAtivo("false"), false);
    assert.equal(agendadorAtivo("FALSE"), false);
    assert.equal(agendadorAtivo(" false "), false);
  });

  it("qualquer outro valor mantem ligado", () => {
    assert.equal(agendadorAtivo("true"), true);
    assert.equal(agendadorAtivo("1"), true);
  });
});
