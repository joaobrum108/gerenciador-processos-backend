import { consultarIxc } from "../database/pool.ixc.ts";

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

const COLUNA_POR_TIPO: Record<TipoIdentificador, string> = {
  MAC: "ra.mac",
  SERIAL: "ac.serial_number",
};

function normalizada(coluna: string): string {
  return `REPLACE(REPLACE(UPPER(${coluna}), ':', ''), '-', '')`;
}

const COLUNAS = `
  ra.mac AS mac,
  ac.serial_number AS serialNumber,
  CAST(ra.id_cliente AS CHAR) AS clienteIxcId,
  CAST(ra.id_cliente AS CHAR) AS clienteCodigo,
  c.razao AS clienteNome,
  NULL AS modeloIxcId,
  NULLIF(
    TRIM(CONCAT(COALESCE(ac.manufacturer, ''), ' ', COALESCE(ac.model, ''))),
    ''
  ) AS modeloNome
`;

const FONTE = `
FROM acs_device ac
LEFT JOIN radusuarios ra ON ra.id = ac.id_login
LEFT JOIN cliente c ON c.id = ra.id_cliente
WHERE ra.ativo = 'S'
`;

export async function buscarPorIdentificador(
  tipo: TipoIdentificador,
  fragmento: string,
  limite = 20,
): Promise<EquipamentoIxc[]> {
  const coluna = COLUNA_POR_TIPO[tipo];
  const alvo = normalizada(coluna);

  return consultarIxc<EquipamentoIxc>(
    `SELECT ${COLUNAS} ${FONTE}
       AND ${coluna} IS NOT NULL
       AND ${coluna} <> ''
       AND ${alvo} LIKE CONCAT('%', ?, '%')
     ORDER BY CASE WHEN ${alvo} LIKE CONCAT('%', ?) THEN 0 ELSE 1 END,
              ${coluna}
     LIMIT ?`,
    [fragmento, fragmento, limite],
  );
}
