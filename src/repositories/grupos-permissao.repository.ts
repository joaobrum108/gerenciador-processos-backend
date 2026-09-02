import { consultar, consultarUm, pool } from "../database/pool.ts";
import type { PoolClient } from "pg";

export interface GrupoRegistro {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface GrupoComTotal extends GrupoRegistro {
  totalUsuarios: number;
}

export interface FiltrosGrupos {
  busca: string | null;
  ativo: boolean | null;
  pagina: number;
  porPagina: number;
  ordenarPor: string;
  ordem: string;
}

const COLUNAS = `
  id,
  nome,
  descricao,
  ativo,
  criado_em AS "criadoEm",
  atualizado_em AS "atualizadoEm"
`;

const CONDICOES_LISTAGEM = `
  WHERE ($1::text IS NULL OR g.nome ILIKE '%' || $1::text || '%' OR g.descricao ILIKE '%' || $1::text || '%')
    AND ($2::boolean IS NULL OR g.ativo = $2::boolean)
`;

const COLUNAS_ORDENACAO: Record<string, string> = {
  nome: "nome",
  criadoEm: "criado_em",
  ativo: "ativo",
};

export const ORDENACOES_PERMITIDAS = Object.keys(COLUNAS_ORDENACAO);

export async function listar(
  filtros: FiltrosGrupos
): Promise<{ dados: GrupoComTotal[]; total: number }> {
  const coluna = COLUNAS_ORDENACAO[filtros.ordenarPor] ?? "nome";
  const direcao = filtros.ordem === "desc" ? "DESC" : "ASC";
  const deslocamento = (filtros.pagina - 1) * filtros.porPagina;

  const dados = await consultar<GrupoComTotal>(
    `SELECT
       g.id,
       g.nome,
       g.descricao,
       g.ativo,
       g.criado_em AS "criadoEm",
       g.atualizado_em AS "atualizadoEm",
       (SELECT COUNT(*)::int FROM usuario_grupos ug WHERE ug.grupo_id = g.id) AS "totalUsuarios"
     FROM grupos_permissao g
     ${CONDICOES_LISTAGEM}
     ORDER BY g.${coluna} ${direcao}
     LIMIT $3 OFFSET $4`,
    [filtros.busca, filtros.ativo, filtros.porPagina, deslocamento]
  );

  const totalizador = await consultarUm<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM grupos_permissao g ${CONDICOES_LISTAGEM}`,
    [filtros.busca, filtros.ativo]
  );

  return { dados, total: Number(totalizador?.total ?? 0) };
}

export async function buscarPorId(id: string): Promise<GrupoRegistro | null> {
  return consultarUm<GrupoRegistro>(
    `SELECT ${COLUNAS} FROM grupos_permissao WHERE id = $1`,
    [id]
  );
}

export async function nomeJaUsado(
  nome: string,
  ignorarGrupoId: string | null = null
): Promise<boolean> {
  const linha = await consultarUm<{ existe: boolean }>(
    `SELECT true AS existe
       FROM grupos_permissao
      WHERE lower(nome) = lower($1)
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [nome, ignorarGrupoId]
  );
  return linha !== null;
}

export async function contarUsuarios(grupoId: string): Promise<number> {
  const linha = await consultarUm<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM usuario_grupos WHERE grupo_id = $1`,
    [grupoId]
  );
  return Number(linha?.total ?? 0);
}

export async function criar(
  nome: string,
  descricao: string | null
): Promise<GrupoRegistro> {
  const { rows } = await pool.query<GrupoRegistro>(
    `INSERT INTO grupos_permissao (id, nome, descricao, ativo, criado_em, atualizado_em)
     VALUES (gen_random_uuid(), $1, $2, true, now(), now())
     RETURNING ${COLUNAS}`,
    [nome, descricao]
  );

  const criado = rows[0];
  if (!criado) {
    throw new Error("Falha ao inserir grupo");
  }
  return criado;
}

export async function atualizar(
  id: string,
  nome: string,
  descricao: string | null,
  ativo: boolean,
  atualizadoEmAnterior: Date
): Promise<GrupoRegistro | null> {
  const { rows } = await pool.query<GrupoRegistro>(
    `UPDATE grupos_permissao
        SET nome = $2, descricao = $3, ativo = $4, atualizado_em = now()
      WHERE id = $1
        AND atualizado_em = $5
      RETURNING ${COLUNAS}`,
    [id, nome, descricao, ativo, atualizadoEmAnterior]
  );
  return rows[0] ?? null;
}

export async function inativar(id: string): Promise<GrupoRegistro | null> {
  const { rows } = await pool.query<GrupoRegistro>(
    `UPDATE grupos_permissao
        SET ativo = false, atualizado_em = now()
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [id]
  );
  return rows[0] ?? null;
}

export async function buscarPermissoes(grupoId: string): Promise<string[]> {
  const linhas = await consultar<{ permissaoId: string }>(
    `SELECT permissao_id AS "permissaoId"
       FROM grupo_permissoes
      WHERE grupo_id = $1
      ORDER BY permissao_id ASC`,
    [grupoId]
  );
  return linhas.map((linha) => linha.permissaoId);
}

export async function substituirPermissoes(
  grupoId: string,
  permissaoIds: string[],
  cliente: PoolClient
): Promise<void> {
  await cliente.query(`DELETE FROM grupo_permissoes WHERE grupo_id = $1`, [
    grupoId,
  ]);

  if (permissaoIds.length > 0) {
    await cliente.query(
      `INSERT INTO grupo_permissoes (grupo_id, permissao_id, criado_em)
       SELECT $1, permissao_id, now() FROM UNNEST($2::varchar[]) AS permissao_id`,
      [grupoId, permissaoIds]
    );
  }

  await cliente.query(
    `UPDATE grupos_permissao SET atualizado_em = now() WHERE id = $1`,
    [grupoId]
  );
}
