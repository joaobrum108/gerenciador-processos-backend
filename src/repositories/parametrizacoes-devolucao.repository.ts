import { consultar } from "../database/pool.ts";

export interface ParametrizacaoDevolucao {
  id: string;
  nome: string;
  ativo: boolean;
}

// Os seletores da tela nao devem oferecer parametrizacoes desativadas; registros
// antigos continuam apontando para elas pela FK, mas ninguem escolhe uma nova.
function consultarAtivos(tabela: string): Promise<ParametrizacaoDevolucao[]> {
  return consultar<ParametrizacaoDevolucao>(
    `SELECT id, nome, ativo FROM ${tabela} WHERE ativo = true ORDER BY nome`,
  );
}

export function listarMotivos(): Promise<ParametrizacaoDevolucao[]> {
  return consultarAtivos("motivos_devolucao");
}

export function listarParadeiros(): Promise<ParametrizacaoDevolucao[]> {
  return consultarAtivos("paradeiros");
}
