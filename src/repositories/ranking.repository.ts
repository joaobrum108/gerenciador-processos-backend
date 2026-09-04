import { consultar } from "../database/pool.ts";

export interface ConfiguracaoRankingRegistro {
  id: string;
  pontosPorErro: string;
  pontosPorMinutoAtraso: string;
  pontosPorFalta: string;
  limiteAltaPerformance: string;
  vigenteDe: Date;
}

export interface DadosConfiguracao {
  pontosPorErro: number;
  pontosPorMinutoAtraso: number;
  pontosPorFalta: number;
  limiteAltaPerformance: number;
  criadoPorUsuarioId: string;
}

export async function buscarConfiguracaoVigente(): Promise<ConfiguracaoRankingRegistro | null> {
  const linhas = await consultar<ConfiguracaoRankingRegistro>(
    `SELECT
       id,
       pontos_por_erro::text AS "pontosPorErro",
       pontos_por_minuto_atraso::text AS "pontosPorMinutoAtraso",
       pontos_por_falta::text AS "pontosPorFalta",
       limite_alta_performance::text AS "limiteAltaPerformance",
       vigente_de AS "vigenteDe"
     FROM configuracoes_ranking
     WHERE vigente_ate IS NULL
     ORDER BY vigente_de DESC
     LIMIT 1`,
  );

  return linhas[0] ?? null;
}

export async function gravarConfiguracao(
  dados: DadosConfiguracao,
): Promise<ConfiguracaoRankingRegistro> {
  const vigente = await buscarConfiguracaoVigente();

  if (vigente !== null) {
    const linhas = await consultar<ConfiguracaoRankingRegistro>(
      `UPDATE configuracoes_ranking
          SET pontos_por_erro = $2,
              pontos_por_minuto_atraso = $3,
              pontos_por_falta = $4,
              limite_alta_performance = $5
        WHERE id = $1
        RETURNING id,
                  pontos_por_erro::text AS "pontosPorErro",
                  pontos_por_minuto_atraso::text AS "pontosPorMinutoAtraso",
                  pontos_por_falta::text AS "pontosPorFalta",
                  limite_alta_performance::text AS "limiteAltaPerformance",
                  vigente_de AS "vigenteDe"`,
      [
        vigente.id,
        dados.pontosPorErro,
        dados.pontosPorMinutoAtraso,
        dados.pontosPorFalta,
        dados.limiteAltaPerformance,
      ],
    );

    return linhas[0]!;
  }

  const linhas = await consultar<ConfiguracaoRankingRegistro>(
    `INSERT INTO configuracoes_ranking
       (pontos_por_erro, pontos_por_minuto_atraso, pontos_por_falta,
        limite_alta_performance, vigente_de, criado_por_usuario_id)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)
     RETURNING id,
               pontos_por_erro::text AS "pontosPorErro",
               pontos_por_minuto_atraso::text AS "pontosPorMinutoAtraso",
               pontos_por_falta::text AS "pontosPorFalta",
               limite_alta_performance::text AS "limiteAltaPerformance",
               vigente_de AS "vigenteDe"`,
    [
      dados.pontosPorErro,
      dados.pontosPorMinutoAtraso,
      dados.pontosPorFalta,
      dados.limiteAltaPerformance,
      dados.criadoPorUsuarioId,
    ],
  );

  return linhas[0]!;
}
