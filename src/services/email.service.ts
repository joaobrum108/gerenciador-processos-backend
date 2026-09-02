import nodemailer from "nodemailer";

export interface CredenciaisNovoUsuario {
  nome: string;
  email: string;
  senhaTemporaria: string;
}

export interface EmailService {
  enviarCredenciaisNovoUsuario(
    credenciais: CredenciaisNovoUsuario
  ): Promise<void>;
}

function configuracaoSmtp() {
  const host = process.env.SMTP_HOST;
  const usuario = process.env.SMTP_USER;
  const senha = process.env.SMTP_PASS;
  const remetente = process.env.SMTP_FROM;

  if (!host || !usuario || !senha || !remetente) {
    throw new Error(
      "SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM devem estar definidos no .env"
    );
  }

  const porta = Number(process.env.SMTP_PORT ?? 587);

  if (!Number.isInteger(porta) || porta <= 0) {
    throw new Error("SMTP_PORT deve ser uma porta valida");
  }

  return {
    host,
    port: porta,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: usuario, pass: senha },
    remetente,
  };
}

export const emailService: EmailService = {
  async enviarCredenciaisNovoUsuario({
    nome,
    email,
    senhaTemporaria,
  }): Promise<void> {
    const { remetente, ...smtp } = configuracaoSmtp();
    const transporte = nodemailer.createTransport(smtp);
    const urlLogin = process.env.FRONTEND_LOGIN_URL;

    await transporte.sendMail({
      from: remetente,
      to: email,
      subject: "Seu acesso ao Gerenciador de Processos",
      text: [
        `Ola, ${nome}.`,
        "",
        "Seu acesso ao Gerenciador de Processos foi criado.",
        `Usuario: ${email}`,
        `Senha temporaria: ${senhaTemporaria}`,
        ...(urlLogin ? [`Acesse: ${urlLogin}`] : []),
        "",
        "Por seguranca, troque a senha no primeiro acesso.",
      ].join("\n"),
    });
  },
};
