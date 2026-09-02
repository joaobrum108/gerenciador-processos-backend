import { consultarUm, pool } from "../database/pool.ts";
import type { PoolClient } from "pg";

export type MotivoRevogacao =
  | "LOGOUT"
  | "ROTACAO"
  | "TROCA_SENHA"
  | "BLOQUEIO_USUARIO";

export interface SessaoRegistro {
  id: string;
  usuarioId: string;
  expiraEm: Date;
  revogadoEm: Date | null;
  motivoRevogacao: MotivoRevogacao | null;
  substituidaPorSessaoId: string | null;
  ultimoUsoEm: Date | null;
  criadoEm: Date;
}

export interface DadosCriacaoSessao {
  usuarioId: string;
  refreshTokenHash: string;
  expiraEm: Date;
  ipOrigem: string | null;
  userAgent: string | null;
}

const COLUNAS = `
  id,
  usuario_id AS "usuarioId",
  expira_em AS "expiraEm",
  revogado_em AS "revogadoEm",
  motivo_revogacao AS "motivoRevogacao",
  substituida_por_sessao_id AS "substituidaPorSessaoId",
  ultimo_uso_em AS "ultimoUsoEm",
  criado_em AS "criadoEm"
`;

export async function criar(
  dados: DadosCriacaoSessao,
  cliente: PoolClient | null = null
): Promise<SessaoRegistro> {
  const executor = cliente ?? pool;
  const { rows } = await executor.query<SessaoRegistro>(
    `INSERT INTO sessoes (
       id, usuario_id, refresh_token_hash, expira_em,
       ip_origem, user_agent, criado_em, atualizado_em
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())
     RETURNING ${COLUNAS}`,
    [
      dados.usuarioId,
      dados.refreshTokenHash,
      dados.expiraEm,
      dados.ipOrigem,
      dados.userAgent,
    ]
  );

  const criada = rows[0];
  if (!criada) {
    throw new Error("Falha ao inserir sessao");
  }
  return criada;
}

export async function buscarPorHash(
  refreshTokenHash: string
): Promise<SessaoRegistro | null> {
  return consultarUm<SessaoRegistro>(
    `SELECT ${COLUNAS} FROM sessoes WHERE refresh_token_hash = $1`,
    [refreshTokenHash]
  );
}

export async function revogar(
  id: string,
  motivo: MotivoRevogacao,
  substituidaPorSessaoId: string | null = null,
  cliente: PoolClient | null = null
): Promise<void> {
  const executor = cliente ?? pool;
  await executor.query(
    `UPDATE sessoes
        SET revogado_em = now(),
            motivo_revogacao = $2,
            substituida_por_sessao_id = $3,
            atualizado_em = now()
      WHERE id = $1
        AND revogado_em IS NULL`,
    [id, motivo, substituidaPorSessaoId]
  );
}

export async function revogarTodasDoUsuario(
  usuarioId: string,
  motivo: MotivoRevogacao,
  cliente: PoolClient | null = null
): Promise<number> {
  const executor = cliente ?? pool;
  const resultado = await executor.query(
    `UPDATE sessoes
        SET revogado_em = now(),
            motivo_revogacao = $2,
            atualizado_em = now()
      WHERE usuario_id = $1
        AND revogado_em IS NULL`,
    [usuarioId, motivo]
  );
  return resultado.rowCount ?? 0;
}

export async function registrarUso(id: string): Promise<void> {
  await pool.query(
    `UPDATE sessoes SET ultimo_uso_em = now(), atualizado_em = now() WHERE id = $1`,
    [id]
  );
}
