import dotenv from "dotenv";

dotenv.config();

export interface Env {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
}

/**
 * Valida a configuracao no boot. Sem isso, um JWT_SECRET vazio so aparece como
 * 500 na primeira tentativa de login — falhar ao subir e mais barato do que
 * descobrir em producao que ninguem consegue autenticar.
 */
export function lerEnv(fonte: NodeJS.ProcessEnv = process.env): Env {
  const erros: string[] = [];

  const databaseUrl = (fonte.DATABASE_URL ?? "").trim();
  if (databaseUrl === "") {
    erros.push("DATABASE_URL e obrigatoria (veja .env.example).");
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    erros.push("DATABASE_URL deve ser uma URL postgresql:// valida.");
  }

  const jwtSecret = fonte.JWT_SECRET ?? "";
  if (jwtSecret.trim() === "") {
    erros.push(
      "JWT_SECRET e obrigatoria e nao pode ser vazia. Gere uma com: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  } else if (jwtSecret.length < 32) {
    erros.push("JWT_SECRET deve ter ao menos 32 caracteres.");
  }

  const portaBruta = (fonte.PORT ?? "3200").trim();
  const port = Number(portaBruta);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    erros.push(`PORT invalida: "${portaBruta}". Use um inteiro entre 1 e 65535.`);
  }

  if (erros.length > 0) {
    throw new Error(`Configuracao invalida:\n  - ${erros.join("\n  - ")}`);
  }

  return { port, databaseUrl, jwtSecret };
}
