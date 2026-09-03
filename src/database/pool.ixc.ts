import mysql from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";
import dotenv from "dotenv";
import { ErroAplicacao } from "../erros.ts";

dotenv.config();

let poolIxc: Pool | null = null;

const VARIAVEIS = [
  "DB_HOST_IXC",
  "DB_USER_IXC",
  "DB_PASS_IXC",
  "DB_NAME_IXC",
] as const;

const FALHAS_DE_CONEXAO = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_CON_COUNT_ERROR",
]);

export function ixcIndisponivel(mensagem: string): ErroAplicacao {
  return new ErroAplicacao(503, "IXC_INDISPONIVEL", mensagem);
}

export function ixcConfigurado(): boolean {
  return VARIAVEIS.every(
    (variavel) => (process.env[variavel] ?? "").trim() !== ""
  );
}

function obterPool(): Pool {
  if (!ixcConfigurado()) {
    const ausentes = VARIAVEIS.filter(
      (variavel) => (process.env[variavel] ?? "").trim() === ""
    );

    throw ixcIndisponivel(
      `Integracao com o IXC nao configurada (falta ${ausentes.join(", ")} no .env)`
    );
  }

  poolIxc ??= mysql.createPool({
    host: process.env.DB_HOST_IXC ?? "",
    user: process.env.DB_USER_IXC ?? "",
    password: process.env.DB_PASS_IXC ?? "",
    database: process.env.DB_NAME_IXC ?? "",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10000,
  });

  return poolIxc;
}

function traduzirFalha(erro: unknown): unknown {
  if (typeof erro !== "object" || erro === null || !("code" in erro)) {
    return erro;
  }

  const codigo = (erro as { code: unknown }).code;

  if (typeof codigo === "string" && FALHAS_DE_CONEXAO.has(codigo)) {
    return ixcIndisponivel("Nao foi possivel consultar o IXC no momento");
  }

  return erro;
}

export async function consultarIxc<T>(
  sql: string,
  parametros: unknown[] = []
): Promise<T[]> {
  try {
    const [linhas] = await obterPool().query<RowDataPacket[]>(sql, parametros);
    return linhas as T[];
  } catch (erro) {
    throw traduzirFalha(erro);
  }
}

export async function consultarUmIxc<T>(
  sql: string,
  parametros: unknown[] = []
): Promise<T | null> {
  const linhas = await consultarIxc<T>(sql, parametros);
  return linhas[0] ?? null;
}

export async function encerrarPoolIxc(): Promise<void> {
  if (!poolIxc) {
    return;
  }

  const alvo = poolIxc;
  poolIxc = null;
  await alvo.end();
}
