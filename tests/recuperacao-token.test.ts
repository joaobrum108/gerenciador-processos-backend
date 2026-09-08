import { it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { gerarTokenRecuperacao, validarTokenRecuperacao } from "../src/services/recuperacao-token.ts";

const segredo = "segredo-exclusivo-para-testes-de-recuperacao";
it("aceita token do usuario correto e define expiracao de 30 minutos", () => {
  const token = gerarTokenRecuperacao("u1", "hash1", segredo);
  validarTokenRecuperacao(token, "u1", "hash1", segredo);
  const conteudo = jwt.decode(token) as jwt.JwtPayload;
  assert.equal(conteudo.exp! - conteudo.iat!, 1800);
});
it("invalida links apos troca de senha e rejeita outro usuario ou segredo", () => {
  const token = gerarTokenRecuperacao("u1", "hash1", segredo);
  assert.throws(() => validarTokenRecuperacao(token, "u1", "hash2", segredo));
  assert.throws(() => validarTokenRecuperacao(token, "u2", "hash1", segredo));
  assert.throws(() => validarTokenRecuperacao(token, "u1", "hash1", "outro"));
});
it("rejeita token expirado e token de login", () => {
  const chave = createHmac("sha256", segredo).update("recuperacao-senha:hash1").digest();
  const expirado = jwt.sign({}, chave, { subject: "u1", audience: "recuperacao-senha", expiresIn: -1 });
  assert.throws(() => validarTokenRecuperacao(expirado, "u1", "hash1", segredo));
  assert.throws(() => validarTokenRecuperacao(jwt.sign({ sub: "u1" }, segredo), "u1", "hash1", segredo));
});
