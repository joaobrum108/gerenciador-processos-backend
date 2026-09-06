export interface EquipamentoIxc {
  mac: string | null;
  serialNumber: string;
  clienteIxcId: string | null;
  clienteCodigo: string | null;
  clienteNome: string | null;
  modeloIxcId: string | null;
  modeloNome: string | null;
}

export type TipoIdentificador = "MAC" | "SERIAL";

/**
 * BUSCA DE EQUIPAMENTO NO IXC — AINDA NAO IMPLEMENTADA.
 *
 * A rota, o controller e a tela ja estao prontos e se comportam corretamente
 * com a lista vazia. Falta apenas a consulta ao IXC, que nao foi escrita porque
 * a tabela e as colunas ainda nao foram confirmadas na base da RedFox.
 *
 * ── O que precisa ser descoberto ────────────────────────────────────────────
 *
 * 1. Em qual tabela do IXC vive o equipamento do cliente com o MAC.
 *    No IXC Soft o candidato usual e `radusuarios`, mas as consultas que ja
 *    existem neste projeto so tocam `cliente`, `funcionarios`, `su_oss_chamado`
 *    e `wfl_tarefa` — nao ha precedente aqui para equipamentos.
 *    Para descobrir, com a VPN ligada:
 *
 *      SHOW TABLES LIKE '%rad%';
 *      SHOW TABLES LIKE '%equip%';
 *      SHOW COLUMNS FROM radusuarios LIKE '%mac%';
 *
 * 2. Os nomes reais das colunas de: MAC, serial/patrimonio, id do cliente,
 *    id e nome do modelo do equipamento.
 *
 * 3. Se o serial fica na mesma tabela do MAC ou em outra (estoque/patrimonio).
 *    Se for outra, esta funcao precisa de dois caminhos, um por `tipo`.
 *
 * ── O que a consulta precisa devolver ───────────────────────────────────────
 *
 * Uma linha por equipamento, com as colunas exatamente com os nomes da
 * interface `EquipamentoIxc` acima (mac, serialNumber, clienteIxcId,
 * clienteCodigo, clienteNome, modeloIxcId, modeloNome). O controller e o front
 * consomem esses nomes; mudando o SELECT, nada mais muda.
 *
 * ── Comportamento esperado ──────────────────────────────────────────────────
 *
 * O `fragmento` chega ja normalizado (so 0-9 e A-Z, maiusculo). A tela permite
 * digitar so os ultimos digitos do MAC, entao o LIKE precisa ser '%fragmento%'
 * e a ordenacao deve priorizar quem TERMINA com o fragmento.
 *
 * ── Esboco, a validar antes de ativar ───────────────────────────────────────
 *
 * const COLUNA_POR_TIPO: Record<TipoIdentificador, string> = {
 *   MAC: "r.mac",
 *   SERIAL: "r.serial",
 * };
 *
 * const coluna = COLUNA_POR_TIPO[tipo];
 * const normalizada = `REPLACE(REPLACE(UPPER(${coluna}), ':', ''), '-', '')`;
 *
 * return consultarIxc<EquipamentoIxc>(
 *   `SELECT
 *      r.mac       AS mac,
 *      r.serial    AS serialNumber,
 *      c.id        AS clienteIxcId,
 *      c.id        AS clienteCodigo,
 *      c.razao     AS clienteNome,
 *      r.id_modelo AS modeloIxcId,
 *      r.modelo    AS modeloNome
 *    FROM radusuarios r
 *    LEFT JOIN cliente c ON c.id = r.id_cliente
 *    WHERE ${coluna} IS NOT NULL AND ${coluna} <> ''
 *      AND ${normalizada} LIKE CONCAT('%', ?, '%')
 *    ORDER BY CASE WHEN ${normalizada} LIKE CONCAT('%', ?) THEN 0 ELSE 1 END,
 *             ${coluna}
 *    LIMIT ?`,
 *   [fragmento, fragmento, limite],
 * );
 *
 * Para ativar: descomentar o esboco, corrigir tabela e colunas conforme os
 * passos 1 a 3, e reimportar `consultarIxc` de `../database/pool.ixc.ts`.
 */
export async function buscarPorIdentificador(
  _tipo: TipoIdentificador,
  _fragmento: string,
  _limite = 20,
): Promise<EquipamentoIxc[]> {
  return [];
}
