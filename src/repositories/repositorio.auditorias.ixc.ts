import { consultarIxc } from "../database/pool.ixc.ts";
import { margemUltimaAtualizacao } from "./margem.ixc.ts";
import { PALAVRAS_CHAVE_ASSUNTO } from "./pontuacao-os.repository.ts";

const FILTRO_DEPARTAMENTO = PALAVRAS_CHAVE_ASSUNTO.map(
  (palavra) =>
    `COALESCE(su_oss_chamado_su_oss_assunto.assunto, '') LIKE '%${palavra}%'`,
).join("\n            OR ");

export interface AuditoriaIxc {
  ocorrenciaIxcId: number;
  chamadoIxcId: number;
  clienteIxcId: number | null;
  clienteNome: string | null;
  assunto: string | null;
  auditorIxcId: number | null;
  auditorNome: string | null;
  operadorIxcId: number | null;
  diagnostico: string | null;
  mensagem: string | null;
  tarefa: string | null;
  statusOcorrencia: string | null;
  abertoEm: string;
  fechadoEm: string;
}

export interface PeriodoAuditorias {
  dataInicio: string;

  dataFim: string;
}

export interface GrupoAuditoriaIxc {
  operadorIxcId: number | null;
  auditorNome: string | null;
  assuntoIxcId: number | null;
  assunto: string | null;
  diagnostico: string | null;
  tarefa: string | null;
  total: number;
}

export interface IntervaloAuditorIxc {
  operadorIxcId: number | null;
  intervaloMedioMinutos: number | null;
  intervalos: number;
}

export interface ResumoAuditoriasIxc {
  grupos: GrupoAuditoriaIxc[];
  intervalos: IntervaloAuditorIxc[];
}

export interface OsPorAssuntoIxc {
  operadorIxcId: number | null;
  assuntoIxcId: number | null;
  osDistintas: number;
}

const COLUNAS = `  su_oss_chamado_mensagem.id AS ocorrenciaIxcId,
  su_oss_chamado_mensagem.id_chamado AS chamadoIxcId,
  su_oss_chamado_mensagem_su_oss_chamado.id_cliente AS clienteIxcId,
  su_oss_chamado_cliente.razao AS clienteNome,
  su_oss_chamado_su_oss_assunto.assunto AS assunto,
  su_oss_chamado_mensagem.id_tecnico AS auditorIxcId,
  su_oss_chamado_mensagem_funcionarios.funcionario AS auditorNome,
  su_oss_chamado_mensagem.id_operador AS operadorIxcId,
  su_oss_chamado_mensagem_su_diagnostico.descricao AS diagnostico,
  su_oss_chamado_mensagem.mensagem AS mensagem,
  su_oss_chamado_mensagem_wfl_tarefa.descricao AS tarefa,
  su_oss_chamado_mensagem.status AS statusOcorrencia,
  DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_abertura, "%d/%m/%Y %H:%i:%s") AS abertoEm,
  DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_fechamento, "%d/%m/%Y %H:%i:%s") AS fechadoEm`;

const FONTE = `FROM su_oss_chamado_mensagem
LEFT JOIN su_oss_chamado su_oss_chamado_mensagem_su_oss_chamado ON su_oss_chamado_mensagem.id_chamado = su_oss_chamado_mensagem_su_oss_chamado.id
LEFT JOIN su_oss_assunto su_oss_chamado_su_oss_assunto ON su_oss_chamado_mensagem_su_oss_chamado.id_assunto = su_oss_chamado_su_oss_assunto.id
LEFT JOIN funcionarios su_oss_chamado_mensagem_funcionarios ON su_oss_chamado_mensagem.id_tecnico = su_oss_chamado_mensagem_funcionarios.id
LEFT JOIN cliente su_oss_chamado_cliente ON su_oss_chamado_mensagem_su_oss_chamado.id_cliente = su_oss_chamado_cliente.id
LEFT JOIN su_diagnostico su_oss_chamado_mensagem_su_diagnostico ON su_oss_chamado_mensagem.id_su_diagnostico = su_oss_chamado_mensagem_su_diagnostico.id
LEFT JOIN wfl_tarefa su_oss_chamado_mensagem_wfl_tarefa ON su_oss_chamado_mensagem.id_proxima_tarefa = su_oss_chamado_mensagem_wfl_tarefa.id
WHERE (su_oss_chamado_mensagem_su_oss_chamado.ultima_atualizacao >= DATE_SUB(?, INTERVAL ? DAY)
       AND su_oss_chamado_mensagem_su_oss_chamado.data_fechamento BETWEEN ? AND ?
       AND (${FILTRO_DEPARTAMENTO})
       AND (su_oss_chamado_mensagem.id_operador IS NOT NULL)
       AND (COALESCE(su_oss_chamado_su_oss_assunto.assunto, '') NOT LIKE '%DIVERGENCIA DE O.S%')
       AND (COALESCE(su_oss_chamado_cliente.razao, '') NOT LIKE '%CLIENTE REDFOX TESTE1%'
            AND COALESCE(su_oss_chamado_cliente.razao, '') NOT LIKE '%TESTE-REDFOX%')
       AND (su_oss_chamado_mensagem.status <> 'A')
       AND (COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%CONTATO SEM SUCESSO%'
            AND COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%DISPENSA VISITA / NORMALIZADO%'
            AND COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%DIVERGÊNCIA NAS FOTOS DO SERVIÇO REALIZADO%'
            AND COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%INVIABILIDADE TÉCNICA%'
            AND COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%NÃO HOUVE INSTALAÇÃO%'
            AND COALESCE(su_oss_chamado_mensagem_su_diagnostico.descricao, '') NOT LIKE '%ORDEM ABERTA ERRADA%'))`;

function parametros(periodo: PeriodoAuditorias): unknown[] {
  return [
    `${periodo.dataInicio} 00:00:00`,
    margemUltimaAtualizacao(periodo.dataInicio),
    `${periodo.dataInicio} 00:00:00`,
    `${periodo.dataFim} 23:59:59`,
  ];
}

export async function listar(
  periodo: PeriodoAuditorias,
): Promise<AuditoriaIxc[]> {
  return consultarIxc<AuditoriaIxc>(
    `SELECT
${COLUNAS}
${FONTE}`,
    parametros(periodo),
  );
}

export async function contarOsPorAssunto(
  periodo: PeriodoAuditorias,
): Promise<OsPorAssuntoIxc[]> {
  return consultarIxc<OsPorAssuntoIxc>(
    `SELECT
  su_oss_chamado_mensagem.id_operador AS operadorIxcId,
  su_oss_chamado_mensagem_su_oss_chamado.id_assunto AS assuntoIxcId,
  COUNT(DISTINCT su_oss_chamado_mensagem.id_chamado) AS osDistintas
${FONTE}
GROUP BY
  su_oss_chamado_mensagem.id_operador,
  su_oss_chamado_mensagem_su_oss_chamado.id_assunto`,
    parametros(periodo),
  );
}

export async function contar(periodo: PeriodoAuditorias): Promise<number> {
  const linhas = await consultarIxc<{ total: number }>(
    `SELECT COUNT(*) AS total
${FONTE}`,
    parametros(periodo),
  );

  return Number(linhas[0]?.total ?? 0);
}

export async function resumir(
  periodo: PeriodoAuditorias,
): Promise<ResumoAuditoriasIxc> {
  const [grupos, intervalos] = await Promise.all([
    consultarIxc<GrupoAuditoriaIxc>(
      `SELECT
  su_oss_chamado_mensagem.id_operador AS operadorIxcId,
  su_oss_chamado_mensagem_funcionarios.funcionario AS auditorNome,
  su_oss_chamado_mensagem_su_oss_chamado.id_assunto AS assuntoIxcId,
  su_oss_chamado_su_oss_assunto.assunto AS assunto,
  su_oss_chamado_mensagem_su_diagnostico.descricao AS diagnostico,
  su_oss_chamado_mensagem_wfl_tarefa.descricao AS tarefa,
  COUNT(*) AS total
${FONTE}
GROUP BY
  su_oss_chamado_mensagem.id_operador,
  su_oss_chamado_mensagem_funcionarios.funcionario,
  su_oss_chamado_mensagem_su_oss_chamado.id_assunto,
  su_oss_chamado_su_oss_assunto.assunto,
  su_oss_chamado_mensagem_su_diagnostico.descricao,
  su_oss_chamado_mensagem_wfl_tarefa.descricao`,
      parametros(periodo),
    ),
    consultarIxc<IntervaloAuditorIxc>(
      `SELECT
  operadorIxcId,
  AVG(minutos) AS intervaloMedioMinutos,
  COUNT(minutos) AS intervalos
FROM (
  SELECT
    su_oss_chamado_mensagem.id_operador AS operadorIxcId,
    TIMESTAMPDIFF(
      SECOND,
      LAG(su_oss_chamado_mensagem_su_oss_chamado.data_fechamento) OVER (
        PARTITION BY
          su_oss_chamado_mensagem.id_operador,
          DATE(su_oss_chamado_mensagem_su_oss_chamado.data_fechamento)
        ORDER BY su_oss_chamado_mensagem_su_oss_chamado.data_fechamento
      ),
      su_oss_chamado_mensagem_su_oss_chamado.data_fechamento
    ) / 60 AS minutos
  ${FONTE}
) baixas
WHERE minutos IS NOT NULL
GROUP BY operadorIxcId`,
      parametros(periodo),
    ),
  ]);

  return { grupos, intervalos };
}
