import { consultar, consultarUm } from "../database/pool.ts";

export interface RegraRankingRegistro {
  id: string;
  nome: string;
  /** numeric(10,2) chega como texto para nao perder casas no driver. */
  pontos: string;
}

export interface DadosRegraRanking {
  nome: string;
  pontos: number;
  criadoPorUsuarioId: string;
}

const COLUNAS = `id, nome, pontos::text AS pontos`;

export function listar(): Promise<RegraRankingRegistro[]> {
  return consultar<RegraRankingRegistro>(
    `SELECT ${COLUNAS} FROM regras_ranking ORDER BY nome`,
  );
}

export function buscar(id: string): Promise<RegraRankingRegistro | null> {
  return consultarUm<RegraRankingRegistro>(
    `SELECT ${COLUNAS} FROM regras_ranking WHERE id = $1`,
    [id],
  );
}

export function buscarPorNome(
  nome: string,
  ignorarId: string | null = null,
): Promise<RegraRankingRegistro | null> {
  return consultarUm<RegraRankingRegistro>(
    `SELECT ${COLUNAS} FROM regras_ranking
      WHERE lower(nome) = lower($1)
        AND ($2::uuid IS NULL OR id <> $2)`,
    [nome, ignorarId],
  );
}

export async function criar(
  dados: DadosRegraRanking,
): Promise<RegraRankingRegistro> {
  const linhas = await consultar<RegraRankingRegistro>(
    `INSERT INTO regras_ranking (nome, pontos, criado_por_usuario_id)
     VALUES ($1, $2, $3)
     RETURNING ${COLUNAS}`,
    [dados.nome, dados.pontos, dados.criadoPorUsuarioId],
  );

  return linhas[0]!;
}

export async function atualizar(
  id: string,
  dados: { nome: string; pontos: number },
): Promise<RegraRankingRegistro | null> {
  const linhas = await consultar<RegraRankingRegistro>(
    `UPDATE regras_ranking
        SET nome = $2, pontos = $3
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [id, dados.nome, dados.pontos],
  );

  return linhas[0] ?? null;
}

export async function remover(id: string): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    `DELETE FROM regras_ranking WHERE id = $1 RETURNING id`,
    [id],
  );

  return linhas.length > 0;
}
