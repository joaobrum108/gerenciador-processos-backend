import { consultar, consultarUm } from "../database/pool.ts";

export interface ParametrizacaoDevolucao {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface DadosParametrizacao {
  nome: string;
  criadoPorUsuarioId: string;
}

export interface AlteracaoParametrizacao {
  nome?: string | undefined;
  ativo?: boolean | undefined;
}

export type TabelaParametrizacao = "motivos_devolucao" | "paradeiros";

function consultarTodos(
  tabela: TabelaParametrizacao,
  incluirInativos: boolean,
): Promise<ParametrizacaoDevolucao[]> {
  return consultar<ParametrizacaoDevolucao>(
    `SELECT id, nome, ativo FROM ${tabela}
      ${incluirInativos ? "" : "WHERE ativo = true"}
      ORDER BY nome`,
  );
}

export function listarMotivos(
  incluirInativos = false,
): Promise<ParametrizacaoDevolucao[]> {
  return consultarTodos("motivos_devolucao", incluirInativos);
}

export function listarParadeiros(
  incluirInativos = false,
): Promise<ParametrizacaoDevolucao[]> {
  return consultarTodos("paradeiros", incluirInativos);
}

export function buscar(
  tabela: TabelaParametrizacao,
  id: string,
): Promise<ParametrizacaoDevolucao | null> {
  return consultarUm<ParametrizacaoDevolucao>(
    `SELECT id, nome, ativo FROM ${tabela} WHERE id = $1`,
    [id],
  );
}

export function buscarPorNome(
  tabela: TabelaParametrizacao,
  nome: string,
  ignorarId: string | null = null,
): Promise<ParametrizacaoDevolucao | null> {
  return consultarUm<ParametrizacaoDevolucao>(
    `SELECT id, nome, ativo FROM ${tabela}
      WHERE lower(btrim(nome)) = lower(btrim($1))
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [nome, ignorarId],
  );
}

export function criar(
  tabela: TabelaParametrizacao,
  dados: DadosParametrizacao,
): Promise<ParametrizacaoDevolucao | null> {
  return consultarUm<ParametrizacaoDevolucao>(
    `INSERT INTO ${tabela} (nome, criado_por_usuario_id)
     VALUES ($1, $2)
     RETURNING id, nome, ativo`,
    [dados.nome, dados.criadoPorUsuarioId],
  );
}

export function atualizar(
  tabela: TabelaParametrizacao,
  id: string,
  alteracao: AlteracaoParametrizacao,
): Promise<ParametrizacaoDevolucao | null> {
  return consultarUm<ParametrizacaoDevolucao>(
    `UPDATE ${tabela}
        SET nome = COALESCE($2, nome),
            ativo = COALESCE($3, ativo),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, nome, ativo`,
    [id, alteracao.nome ?? null, alteracao.ativo ?? null],
  );
}
