import { pool } from "../database/pool.ts";
import type { PoolClient } from "pg";

export interface RegistroAuditoria {
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string;
  dadosAnteriores: unknown | null;
  dadosNovos: unknown | null;
  motivo: string | null;
  ipOrigem: string | null;
}

export async function registrar(
  registro: RegistroAuditoria,
  cliente: PoolClient | null = null
): Promise<void> {
  const executor = cliente ?? pool;
  await executor.query(
    `INSERT INTO auditoria_alteracoes (
       id, usuario_id, acao, entidade, entidade_id,
       dados_anteriores, dados_novos, motivo, ip_origem, criado_em
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      registro.usuarioId,
      registro.acao,
      registro.entidade,
      registro.entidadeId,
      registro.dadosAnteriores === null
        ? null
        : JSON.stringify(registro.dadosAnteriores),
      registro.dadosNovos === null ? null : JSON.stringify(registro.dadosNovos),
      registro.motivo,
      registro.ipOrigem,
    ]
  );
}
