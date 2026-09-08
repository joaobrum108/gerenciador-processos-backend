import { consultar, consultarUm } from "../database/pool.ts";

export interface CargoRegistro {
  id: string;
  nome: string;
  nivel: string | null;
  ativo: boolean;
}

export interface DadosCargo {
  nome: string;
  nivel: string | null;
  criadoPorUsuarioId: string | null;
}

export interface AlteracaoCargo {
  nome?: string | undefined;
  nivel?: string | null | undefined;
  ativo?: boolean | undefined;
}

const COLUNAS = `id, nome, nivel, ativo`;

export function listar(incluirInativos = false): Promise<CargoRegistro[]> {
  return consultar<CargoRegistro>(
    `SELECT ${COLUNAS} FROM cargos
      ${incluirInativos ? "" : "WHERE ativo = true"}
      ORDER BY nome`,
  );
}

export function buscar(id: string): Promise<CargoRegistro | null> {
  return consultarUm<CargoRegistro>(
    `SELECT ${COLUNAS} FROM cargos WHERE id = $1`,
    [id],
  );
}

export function buscarPorNome(
  nome: string,
  ignorarId: string | null = null,
): Promise<CargoRegistro | null> {
  return consultarUm<CargoRegistro>(
    `SELECT ${COLUNAS} FROM cargos
      WHERE lower(btrim(nome)) = lower(btrim($1))
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [nome, ignorarId],
  );
}

export function criar(dados: DadosCargo): Promise<CargoRegistro | null> {
  return consultarUm<CargoRegistro>(
    `INSERT INTO cargos (nome, nivel, criado_por_usuario_id)
     VALUES ($1, $2, $3)
     RETURNING ${COLUNAS}`,
    [dados.nome, dados.nivel, dados.criadoPorUsuarioId],
  );
}

export function atualizar(
  id: string,
  alteracao: AlteracaoCargo,
): Promise<CargoRegistro | null> {
  return consultarUm<CargoRegistro>(
    `UPDATE cargos
        SET nome = COALESCE($2, nome),
            nivel = CASE WHEN $3::boolean THEN $4 ELSE nivel END,
            ativo = COALESCE($5, ativo),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [
      id,
      alteracao.nome ?? null,
      alteracao.nivel !== undefined,
      alteracao.nivel ?? null,
      alteracao.ativo ?? null,
    ],
  );
}

export async function contarUsuarios(id: string): Promise<number> {
  const linha = await consultarUm<{ total: string }>(
    `SELECT COUNT(*) AS total FROM usuarios WHERE cargo_id = $1`,
    [id],
  );

  return Number(linha?.total ?? 0);
}

export async function remover(id: string): Promise<boolean> {
  const linha = await consultarUm<{ id: string }>(
    `DELETE FROM cargos WHERE id = $1 RETURNING id`,
    [id],
  );

  return linha !== null;
}
