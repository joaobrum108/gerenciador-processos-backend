import { consultar } from "../database/pool.ts";

const COLUNAS_CONFIGURACAO = `id,
       pontos_por_erro::text AS "pontosPorErro",
       erro_acrescenta AS "erroAcrescenta",
       pontos_por_minuto_atraso::text AS "pontosPorMinutoAtraso",
       atraso_acrescenta AS "atrasoAcrescenta",
       pontos_por_falta::text AS "pontosPorFalta",
       falta_acrescenta AS "faltaAcrescenta",
       limite_alta_performance::text AS "limiteAltaPerformance",
       vigente_de AS "vigenteDe"`;

export interface ConfiguracaoRankingRegistro {
  id: string;
  pontosPorErro: string;
  erroAcrescenta: boolean;
  pontosPorMinutoAtraso: string;
  atrasoAcrescenta: boolean;
  pontosPorFalta: string;
  faltaAcrescenta: boolean;
  limiteAltaPerformance: string;
  vigenteDe: Date;
}

export interface DadosConfiguracao {
  pontosPorErro: number;
  erroAcrescenta: boolean;
  pontosPorMinutoAtraso: number;
  atrasoAcrescenta: boolean;
  pontosPorFalta: number;
  faltaAcrescenta: boolean;
  limiteAltaPerformance: number;
  criadoPorUsuarioId: string;
}

export interface UsuarioVinculado {
  usuarioId: string;
  funcionarioIxcId: string;
}

export async function listarUsuariosVinculados(): Promise<UsuarioVinculado[]> {
  return consultar<UsuarioVinculado>(
    `SELECT id AS "usuarioId",
            funcionario_ixc_id AS "funcionarioIxcId"
       FROM usuarios
      WHERE funcionario_ixc_id IS NOT NULL
        AND ativo = true`,
  );
}

export interface PontoResumido {
  usuarioId: string;
  funcionarioIxcId: string;
  atrasoMinutos: number;
  faltas: number;
}

export async function resumirPontoPorUsuario(periodo: {
  dataInicio: string;
  dataFim: string;
}): Promise<PontoResumido[]> {
  const linhas = await consultar<{
    usuarioId: string;
    funcionarioIxcId: string;
    atrasoMinutos: string;
    faltas: string;
  }>(
    `SELECT u.id AS "usuarioId",
            u.funcionario_ixc_id AS "funcionarioIxcId",
            COALESCE(SUM(p.atraso_minutos), 0)::text AS "atrasoMinutos",
            COUNT(*) FILTER (WHERE p.status = 'FALTA')::text AS "faltas"
       FROM registros_ponto p
       JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.data BETWEEN $1 AND $2
        AND u.funcionario_ixc_id IS NOT NULL
      GROUP BY u.id, u.funcionario_ixc_id`,
    [periodo.dataInicio, periodo.dataFim],
  );

  return linhas.map((linha) => ({
    usuarioId: linha.usuarioId,
    funcionarioIxcId: linha.funcionarioIxcId,
    atrasoMinutos: Number(linha.atrasoMinutos),
    faltas: Number(linha.faltas),
  }));
}

export async function buscarConfiguracaoVigente(): Promise<ConfiguracaoRankingRegistro | null> {
  const linhas = await consultar<ConfiguracaoRankingRegistro>(
    `SELECT
       ${COLUNAS_CONFIGURACAO}
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
              erro_acrescenta = $3,
              pontos_por_minuto_atraso = $4,
              atraso_acrescenta = $5,
              pontos_por_falta = $6,
              falta_acrescenta = $7,
              limite_alta_performance = $8
        WHERE id = $1
        RETURNING ${COLUNAS_CONFIGURACAO}`,
      [
        vigente.id,
        dados.pontosPorErro,
        dados.erroAcrescenta,
        dados.pontosPorMinutoAtraso,
        dados.atrasoAcrescenta,
        dados.pontosPorFalta,
        dados.faltaAcrescenta,
        dados.limiteAltaPerformance,
      ],
    );

    return linhas[0]!;
  }

  const linhas = await consultar<ConfiguracaoRankingRegistro>(
    `INSERT INTO configuracoes_ranking
       (pontos_por_erro, erro_acrescenta,
        pontos_por_minuto_atraso, atraso_acrescenta,
        pontos_por_falta, falta_acrescenta,
        limite_alta_performance, vigente_de, criado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8)
     RETURNING ${COLUNAS_CONFIGURACAO}`,
    [
      dados.pontosPorErro,
      dados.erroAcrescenta,
      dados.pontosPorMinutoAtraso,
      dados.atrasoAcrescenta,
      dados.pontosPorFalta,
      dados.faltaAcrescenta,
      dados.limiteAltaPerformance,
      dados.criadoPorUsuarioId,
    ],
  );

  return linhas[0]!;
}
