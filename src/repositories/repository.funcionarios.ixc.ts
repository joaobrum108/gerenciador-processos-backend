import { consultarIxc, consultarUmIxc } from "../database/pool.ixc.ts";

export interface FuncionarioIxc {
  idIxc: string;
  nome: string;
  ativo: boolean;
}

interface LinhaFuncionario {
  idIxc: string;
  nome: string;
  ativo: string | null;
}

function paraContrato(linha: LinhaFuncionario): FuncionarioIxc {
  return {
    idIxc: String(linha.idIxc),
    nome: linha.nome,
    ativo: linha.ativo === "S",
  };
}

export interface FiltrosFuncionarios {
  busca?: string | undefined;
  ativo?: boolean | undefined;
}

export interface OrdenacaoFuncionarios {
  ordenarPor: string;
  ordem: "asc" | "desc";
  pagina: number;
  porPagina: number;
}

export const ORDENACOES_PERMITIDAS = ["nome", "id"];

const COLUNA_ORDENACAO: Record<string, string> = {
  nome: "f.funcionario",
  id: "f.id",
};

function condicoes(filtros: FiltrosFuncionarios): {
  sql: string;
  valores: unknown[];
} {
  const partes: string[] = [];
  const valores: unknown[] = [];

  if (filtros.ativo !== undefined) {
    partes.push("f.ativo = ?");
    valores.push(filtros.ativo ? "S" : "N");
  }

  if (filtros.busca !== undefined && filtros.busca !== "") {
    partes.push("f.funcionario LIKE ?");
    valores.push(`%${filtros.busca}%`);
  }

  return {
    sql: partes.length === 0 ? "" : `WHERE ${partes.join(" AND ")}`,
    valores,
  };
}

export async function listar(
  filtros: FiltrosFuncionarios = {},
  ordenacao: OrdenacaoFuncionarios = {
    ordenarPor: "nome",
    ordem: "asc",
    pagina: 1,
    porPagina: 100,
  },
): Promise<FuncionarioIxc[]> {
  const { sql, valores } = condicoes(filtros);
  const coluna = COLUNA_ORDENACAO[ordenacao.ordenarPor] ?? "f.funcionario";
  const direcao = ordenacao.ordem === "desc" ? "DESC" : "ASC";
  const deslocamento = (ordenacao.pagina - 1) * ordenacao.porPagina;

  const linhas = await consultarIxc<LinhaFuncionario>(
    `SELECT CAST(f.id AS CHAR) AS idIxc, f.funcionario AS nome, f.ativo AS ativo
       FROM funcionarios f
       ${sql}
      ORDER BY ${coluna} ${direcao}
      LIMIT ? OFFSET ?`,
    [...valores, ordenacao.porPagina, deslocamento],
  );

  return linhas.map(paraContrato);
}

export async function contar(
  filtros: FiltrosFuncionarios = {},
): Promise<number> {
  const { sql, valores } = condicoes(filtros);

  const linhas = await consultarIxc<{ total: number }>(
    `SELECT COUNT(*) AS total FROM funcionarios f ${sql}`,
    valores,
  );

  return Number(linhas[0]?.total ?? 0);
}

export async function buscarPorId(id: number): Promise<FuncionarioIxc | null> {
  const linha = await consultarUmIxc<LinhaFuncionario>(
    `SELECT CAST(f.id AS CHAR) AS idIxc, f.funcionario AS nome, f.ativo AS ativo
       FROM funcionarios f
      WHERE f.id = ?`,
    [id],
  );

  return linha === null ? null : paraContrato(linha);
}
