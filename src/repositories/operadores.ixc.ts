import { consultarIxc } from "../database/pool.ixc.ts";

export interface OperadorIxc {
  id: number;
  nome: string;
}

export async function buscarNomesOperadores(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const marcadores = ids.map(() => "?").join(", ");

  const operadores = await consultarIxc<OperadorIxc>(
    `SELECT u.id, u.nome
       FROM usuarios u
      WHERE u.id IN (${marcadores})`,
    ids,
  );

  return new Map(operadores.map((operador) => [operador.id, operador.nome]));
}
