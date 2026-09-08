import nodemailer from "nodemailer";
import { z } from "zod";
import { configuracaoSmtp } from "./email.service.ts";
import { ErroAplicacao } from "../erros.ts";
import type { UsuarioAutenticado } from "./auth.service.ts";

const esquemaMensagem = z.object({
  categoria: z.enum(["Acesso e permissões", "Auditoria", "Cadastros", "Colaboradores", "Conferência", "Ferramental", "Frotas", "Erro no sistema", "Outro"]),
  prioridade: z.enum(["Baixa", "Normal", "Alta", "Crítica"]),
  assunto: z.string().trim().min(1).max(100).regex(/^[^\r\n]+$/),
  descricao: z.string().trim().min(15).max(1000),
}).strict();

type EmailSuporte = { from: string; to: string; replyTo: string; subject: string; text: string };
type Configuracao = ReturnType<typeof configuracaoSmtp>;

export function criarSuporteService(deps: {
  smtp: () => Configuracao;
  destino: () => string;
  enviar: (config: Configuracao, email: EmailSuporte) => Promise<void>;
}) {
  return {
    async enviar(corpo: unknown, usuario: Pick<UsuarioAutenticado, "id" | "nomeExibicao" | "emailLogin">) {
      const dados = esquemaMensagem.parse(corpo);
      let smtp: Configuracao;
      let destino: string;
      try {
        smtp = deps.smtp();
        destino = z.email().parse(deps.destino());
      } catch {
        throw new ErroAplicacao(503, "SUPORTE_INDISPONIVEL", "Envio de suporte nao configurado no servidor");
      }
      const replyTo = z.email().safeParse(usuario.emailLogin);
      if (!replyTo.success) {
        throw new ErroAplicacao(422, "EMAIL_SOLICITANTE_INVALIDO", "Atualize seu e-mail antes de enviar uma solicitacao");
      }
      try {
        await deps.enviar(smtp, {
          from: smtp.remetente,
          to: destino,
          replyTo: replyTo.data,
          subject: `[Suporte] ${dados.categoria} · ${dados.assunto}`,
          text: [
            `Categoria: ${dados.categoria}`, `Prioridade: ${dados.prioridade}`,
            "", "Descrição:", dados.descricao, "",
            `Solicitante: ${usuario.nomeExibicao}`, `E-mail: ${usuario.emailLogin}`,
            `Usuário: ${usuario.id}`, "Origem: Central de Suporte do sistema",
          ].join("\n"),
        });
      } catch {
        throw new ErroAplicacao(502, "SUPORTE_ENVIO_FALHOU", "Nao foi possivel confirmar o envio ao servidor de e-mail");
      }
      return { mensagem: "Solicitacao aceita pelo servidor de e-mail", enviadoEm: new Date().toISOString() };
    },
  };
}

export const suporteService = criarSuporteService({
  smtp: configuracaoSmtp,
  destino: () => process.env.SUPORTE_EMAIL_DESTINO ?? "desenvolvimento@redfoxtelecomcom.br",
  async enviar({ remetente: _remetente, ...smtp }, email) {
    const transporte = nodemailer.createTransport({
      ...smtp, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
    try {
      const resultado = await transporte.sendMail(email);
      if (resultado.accepted.length === 0 || resultado.rejected.length > 0) {
        throw new Error("Destinatario rejeitado pelo SMTP");
      }
      console.info("SUPORTE_SMTP_ACEITO", {
        destinatario: email.to,
        messageId: resultado.messageId,
        resposta: resultado.response,
      });
    } catch (erro) {
      const detalhe = erro as { code?: string; responseCode?: number };
      console.error("SUPORTE_SMTP_FALHOU", {
        codigo: detalhe.code ?? "ENVIO_NAO_CONFIRMADO",
        statusSmtp: detalhe.responseCode,
      });
      throw erro;
    } finally {
      transporte.close();
    }
  },
});
