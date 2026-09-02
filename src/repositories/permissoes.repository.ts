import { consultar } from "../database/pool.ts";

export interface PermissaoRegistro {
  id: string;
  nome: string;
  descricao: string | null;
  modulo: string;
}

export async function listar(): Promise<PermissaoRegistro[]> {
  return consultar<PermissaoRegistro>(
    `SELECT id, nome, descricao, modulo
       FROM permissoes
      ORDER BY modulo ASC, nome ASC`
  );
}

export async function listarIdsInexistentes(
  permissaoIds: string[]
): Promise<string[]> {
  if (permissaoIds.length === 0) {
    return [];
  }

  const linhas = await consultar<{ id: string }>(
    `SELECT informado.id
       FROM UNNEST($1::varchar[]) AS informado(id)
       LEFT JOIN permissoes p ON p.id = informado.id
      WHERE p.id IS NULL`,
    [permissaoIds]
  );

  return linhas.map((linha) => linha.id);
}
