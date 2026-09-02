import { Pool } from "pg";
import type { PoolClient, QueryResultRow } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL nao definida no .env");
}

export const pool = new Pool({ connectionString });

export async function consultar<T extends QueryResultRow>(
  sql: string,
  parametros: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, parametros);
  return rows;
}

export async function consultarUm<T extends QueryResultRow>(
  sql: string,
  parametros: unknown[] = []
): Promise<T | null> {
  const linhas = await consultar<T>(sql, parametros);
  return linhas[0] ?? null;
}

export async function emTransacao<T>(
  operacao: (cliente: PoolClient) => Promise<T>
): Promise<T> {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const resultado = await operacao(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}
