import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { z } from "zod";
import { buscarPorEmailLogin, buscarComSenhaPorId } from "../repositories/usuarios.repository.ts";
import { revogarTodasDoUsuario } from "../repositories/sessoes.repository.ts";
import { emTransacao } from "../database/pool.ts";
import { configuracaoSmtp } from "./email.service.ts";
import { gerarTokenRecuperacao, validarTokenRecuperacao } from "./recuperacao-token.ts";
import { ErroAplicacao } from "../erros.ts";

export function configuracaoRecuperacao() {
  try {
    const smtp = configuracaoSmtp();
    const segredo = z.string().min(32).parse(process.env.JWT_SECRET);
    const url = new URL(process.env.FRONTEND_LOGIN_URL ?? "");
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return { smtp, segredo, url };
  } catch {
    throw new ErroAplicacao(503, "RECUPERACAO_INDISPONIVEL", "Recuperacao de senha nao configurada no servidor");
  }
}

export async function enviarRecuperacao(email: string, config: ReturnType<typeof configuracaoRecuperacao>) {
  const usuario = await buscarPorEmailLogin(email);
  if (!usuario || !usuario.ativo || usuario.status !== "ATIVO" || usuario.provedorAuth !== "LOCAL" || !usuario.senhaHash) return;
  const token = gerarTokenRecuperacao(usuario.id, usuario.senhaHash, config.segredo);
  const link = new URL(config.url);
  const parametros = new URLSearchParams({ recuperacao: token, usuario: usuario.id }).toString();
  link.hash = link.hash.startsWith("#/") ? `${link.hash.split("?")[0]}?${parametros}` : parametros;
  const { remetente, ...smtp } = config.smtp;
  const transporte = nodemailer.createTransport({ ...smtp, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  try {
    const resultado = await transporte.sendMail({
      from: remetente, to: usuario.emailLogin,
      subject: "RedFox — Recuperação de senha",
      text: `Olá, ${usuario.nomeExibicao}.\n\nDefina uma nova senha pelo link abaixo, válido por 30 minutos e invalidado após a troca:\n${link.toString()}\n\nSe não solicitou a recuperação, ignore este e-mail. Sua senha permanece a mesma.`,
    });
    if (!resultado.accepted.length || resultado.rejected.length) throw new Error("SMTP rejeitou destinatario");
  } finally {
    transporte.close();
  }
}

export async function redefinirSenhaRecuperacao(id: string, token: string, senha: string) {
  const usuario = await buscarComSenhaPorId(id);
  const invalido = () => new ErroAplicacao(422, "RECUPERACAO_INVALIDA", "Link invalido ou expirado. Solicite uma nova recuperacao.");
  if (!usuario || !usuario.ativo || usuario.status !== "ATIVO" || usuario.provedorAuth !== "LOCAL" || !usuario.senhaHash) throw invalido();
  const segredo = z.string().min(32).parse(process.env.JWT_SECRET);
  try { validarTokenRecuperacao(token, id, usuario.senhaHash, segredo); } catch { throw invalido(); }
  if (await bcrypt.compare(senha, usuario.senhaHash)) {
    throw new ErroAplicacao(422, "SENHA_REPETIDA", "A nova senha deve ser diferente da atual");
  }
  const novoHash = await bcrypt.hash(senha, 12);
  await emTransacao(async (cliente) => {
    // Compare-and-swap garante uso unico inclusive em requisicoes simultaneas.
    const resultado = await cliente.query(
      `UPDATE usuarios SET senha_hash = $3, deve_trocar_senha = false,
       senha_alterada_em = now(), atualizado_em = now()
       WHERE id = $1 AND senha_hash = $2 AND ativo = true AND status = 'ATIVO' AND provedor_auth = 'LOCAL'`,
      [id, usuario.senhaHash, novoHash],
    );
    if (resultado.rowCount !== 1) throw invalido();
    await revogarTodasDoUsuario(id, "TROCA_SENHA", cliente);
  });
}
