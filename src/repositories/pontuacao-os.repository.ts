import { consultar } from "../database/pool.ts";

export interface RegraPontuacaoRegistro {
  id: string;
  assuntoOsIxcId: string;
  assuntoOs: string;
  pontos: string;
  vigenteDe: Date;
  ativo: boolean;
}

export interface ServicoDoIxc {
  assuntoOsIxcId: string;
  assuntoOs: string;
  ocorrencias: string;
}

export interface DadosRegra {
  assuntoOsIxcId: string;
  assuntoOs: string;
  pontos: number;
  criadoPorUsuarioId: string;
}

export async function listarRegras(): Promise<RegraPontuacaoRegistro[]> {
  return consultar<RegraPontuacaoRegistro>(
    `SELECT
       id,
       assunto_os_ixc_id AS "assuntoOsIxcId",
       assunto_os_nome_snapshot AS "assuntoOs",
       pontos::text AS pontos,
       vigente_de AS "vigenteDe",
       ativo
     FROM regras_pontuacao_os
     WHERE ativo = true AND vigente_ate IS NULL
     ORDER BY assunto_os_nome_snapshot`,
  );
}

export async function listarServicosDoEspelho(): Promise<ServicoDoIxc[]> {
  return consultar<ServicoDoIxc>(
    `SELECT
       o.assunto_ixc_id::text AS "assuntoOsIxcId",
       MAX(o.assunto_snapshot) AS "assuntoOs",
       COUNT(*)::text AS ocorrencias
     FROM ocorrencias_ixc o
     WHERE o.assunto_ixc_id IS NOT NULL
       AND o.setor_snapshot ILIKE '%AUDITORIA%'
     GROUP BY o.assunto_ixc_id
     ORDER BY 2`,
  );
}

export async function buscarRegra(
  assuntoOsIxcId: string,
): Promise<RegraPontuacaoRegistro | null> {
  const linhas = await consultar<RegraPontuacaoRegistro>(
    `SELECT
       id,
       assunto_os_ixc_id AS "assuntoOsIxcId",
       assunto_os_nome_snapshot AS "assuntoOs",
       pontos::text AS pontos,
       vigente_de AS "vigenteDe",
       ativo
     FROM regras_pontuacao_os
     WHERE assunto_os_ixc_id = $1 AND ativo = true AND vigente_ate IS NULL`,
    [assuntoOsIxcId],
  );

  return linhas[0] ?? null;
}

export async function gravarRegra(
  dados: DadosRegra,
): Promise<RegraPontuacaoRegistro> {
  const existente = await buscarRegra(dados.assuntoOsIxcId);

  if (existente !== null) {
    const linhas = await consultar<RegraPontuacaoRegistro>(
      `UPDATE regras_pontuacao_os
          SET pontos = $2, assunto_os_nome_snapshot = $3
        WHERE id = $1
        RETURNING id,
                  assunto_os_ixc_id AS "assuntoOsIxcId",
                  assunto_os_nome_snapshot AS "assuntoOs",
                  pontos::text AS pontos,
                  vigente_de AS "vigenteDe",
                  ativo`,
      [existente.id, dados.pontos, dados.assuntoOs],
    );

    return linhas[0]!;
  }

  const linhas = await consultar<RegraPontuacaoRegistro>(
    `INSERT INTO regras_pontuacao_os
       (assunto_os_ixc_id, assunto_os_nome_snapshot, pontos, vigente_de, criado_por_usuario_id)
     VALUES ($1, $2, $3, CURRENT_DATE, $4)
     RETURNING id,
               assunto_os_ixc_id AS "assuntoOsIxcId",
               assunto_os_nome_snapshot AS "assuntoOs",
               pontos::text AS pontos,
               vigente_de AS "vigenteDe",
               ativo`,
    [dados.assuntoOsIxcId, dados.assuntoOs, dados.pontos, dados.criadoPorUsuarioId],
  );

  return linhas[0]!;
}

export async function removerRegra(assuntoOsIxcId: string): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    `DELETE FROM regras_pontuacao_os
      WHERE assunto_os_ixc_id = $1 AND ativo = true AND vigente_ate IS NULL
      RETURNING id`,
    [assuntoOsIxcId],
  );

  return linhas.length > 0;
}
