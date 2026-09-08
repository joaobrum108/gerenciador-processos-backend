import { it } from "node:test";
import assert from "node:assert/strict";
import { criarSuporteService } from "../src/services/suporte.service.ts";

const usuario = { id: "usuario-1", nomeExibicao: "João", emailLogin: "joao@example.com" };
const dados = { categoria: "Erro no sistema", prioridade: "Alta", assunto: "Falha ao salvar", descricao: "A tela apresenta erro ao salvar o registro." };
const config = { host: "smtp.example.com", port: 587, secure: false, auth: { user: "smtp", pass: "teste" }, remetente: "sistema@example.com" };

it("envia para o destino do servidor com resposta ao usuario autenticado", async () => {
  let envios = 0;
  const service = criarSuporteService({
    smtp: () => config, destino: () => "suporte@example.com",
    enviar: async (_, email) => {
      envios++;
      assert.equal(email.to, "suporte@example.com");
      assert.equal(email.from, config.remetente);
      assert.equal(email.replyTo, usuario.emailLogin);
      assert.ok(email.text.includes(dados.descricao));
      assert.ok(email.text.includes(usuario.id));
    },
  });
  assert.ok((await service.enviar(dados, usuario)).enviadoEm);
  assert.equal(envios, 1);
});

it("rejeita dados invalidos e tentativa de escolher destinatario antes de enviar", async () => {
  const service = criarSuporteService({ smtp: () => config, destino: () => "suporte@example.com", enviar: async () => { assert.fail("Nao deve enviar"); } });
  for (const corpo of [ { ...dados, descricao: "curta" }, { ...dados, assunto: "a\r\nb" }, { ...dados, prioridade: "urgente" }, { ...dados, to: "outro@example.com" } ]) {
    await assert.rejects(service.enviar(corpo, usuario), { name: "ZodError" });
  }
});

it("retorna 503 se SMTP estiver ausente", async () => {
  const service = criarSuporteService({ smtp: () => { throw new Error("ausente"); }, destino: () => "suporte@example.com", enviar: async () => { assert.fail("Nao deve enviar"); } });
  await assert.rejects(service.enviar(dados, usuario), { status: 503, codigo: "SUPORTE_INDISPONIVEL" });
});

it("retorna 502 sem expor detalhes de SMTP nem informar sucesso", async () => {
  const service = criarSuporteService({ smtp: () => config, destino: () => "suporte@example.com", enviar: async () => { throw new Error("segredo SMTP"); } });
  await assert.rejects(service.enviar(dados, usuario), { status: 502, codigo: "SUPORTE_ENVIO_FALHOU", message: "Nao foi possivel confirmar o envio ao servidor de e-mail" });
});
