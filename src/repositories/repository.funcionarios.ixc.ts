import { consultarIxc, consultarUmIxc } from "../database/pool.ixc.ts";

export interface FuncionarioIxc {
  id: number;
  nome: string;
}

export async function listar(): Promise<FuncionarioIxc[]> {
  return consultarIxc<FuncionarioIxc>(
    `SELECT f.id, f.funcionario AS nome
       FROM funcionarios f`
  );
}

export async function buscarPorId(id: number): Promise<FuncionarioIxc | null> {
  return consultarUmIxc<FuncionarioIxc>(
    `SELECT f.id, f.funcionario AS nome
       FROM funcionarios f
      WHERE f.id = ?`,
    [id]
  );
}
