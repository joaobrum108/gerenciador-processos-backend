import { consultar } from "../database/pool.ts";

export const AUDITORES = [
  "LUANA ALVES",
  "DANIEL VELUCCI",
  "PAMELA EVELYN",
  "MATHEUS SANTOS",
  "GABRIEL SANTOS DE OLIVEIRA",
  "RHIKELLMY ISRAEL",
  "WALLACE WENDRE",
  "GIULIO CESAR",
  "GUILHERME ANDRADE",
  "GUILHERME DA SILVA SOUZA",
  "MARCOS VINICIUS LUCENA CUSTODIO",
  "VICTOR HUGO",
  "GUSTAVO HAINO",
  "LUCAS BORGES VETZCOSKI",
  "KAUE DA SILVA BRANDAO",
  "DAVI RODRIGUES DE CARVALHO",
] as const;

export const DIAGNOSTICOS_EXCLUIDOS = [
  "CONTATO SEM SUCESSO",
  "DISPENSA VISITA / NORMALIZADO",
  "DIVERGÊNCIA NAS FOTOS DO SERVIÇO REALIZADO",
  "INVIABILIDADE TÉCNICA",
  "NÃO HOUVE INSTALAÇÃO",
  "ORDEM ABERTA ERRADA",
] as const;

export const CLIENTES_DE_TESTE = [
  "TESTE-REDFOX",
  "CLIENTE REDFOX TESTE1",
] as const;

export interface AuditoriaLocal {
  ocorrenciaIxcId: string;
  chamadoIxcId: string;
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
  abertoEm: Date;
  fechadoEm: Date;
}

export interface GrupoAuditoriaLocal {
  operadorIxcId: number | null;
  auditorNome: string | null;
  assuntoIxcId: number | null;
  assunto: string | null;
  diagnostico: string | null;
  tarefa: string | null;
  total: string;
}

export interface IntervaloAuditorLocal {
  operadorIxcId: number | null;
  intervaloMedioMinutos: string | null;
  intervalos: string;
}

export interface PeriodoAuditorias {
  dataInicio: string;
  dataFim: string;
}

function condicoes(): { sql: string; extras: string[] } {
  let indice = 3;
  const extras: string[] = [];

  const auditores = AUDITORES.map((nome) => {
    extras.push(`%${nome}%`);
    return `o.funcionario_nome_snapshot ILIKE $${indice++}`;
  }).join(" OR ");

  const diagnosticos = DIAGNOSTICOS_EXCLUIDOS.map((descricao) => {
    extras.push(`%${descricao}%`);
    return `COALESCE(o.diagnostico_snapshot, '') NOT ILIKE $${indice++}`;
  }).join(" AND ");

  const clientes = CLIENTES_DE_TESTE.map((razao) => {
    extras.push(`%${razao}%`);
    return `COALESCE(o.cliente_nome_snapshot, '') NOT ILIKE $${indice++}`;
  }).join(" AND ");

  return {
    sql: `o.fechado_em >= $1::date
      AND o.fechado_em < ($2::date + INTERVAL '1 day')
      AND o.setor_snapshot ILIKE '%AUDITORIA%'
      AND o.status_ocorrencia <> 'A'
      AND (${auditores})
      AND ${diagnosticos}
      AND ${clientes}`,
    extras,
  };
}

function parametros(periodo: PeriodoAuditorias): unknown[] {
  return [periodo.dataInicio, periodo.dataFim, ...condicoes().extras];
}

export async function listar(
  periodo: PeriodoAuditorias,
): Promise<AuditoriaLocal[]> {
  return consultar<AuditoriaLocal>(
    `SELECT
       o.ocorrencia_ixc_id::text AS "ocorrenciaIxcId",
       o.chamado_ixc_id::text AS "chamadoIxcId",
       o.cliente_ixc_id AS "clienteIxcId",
       o.cliente_nome_snapshot AS "clienteNome",
       o.assunto_snapshot AS "assunto",
       o.funcionario_ixc_id AS "auditorIxcId",
       o.auditor_nome_snapshot AS "auditorNome",
       o.operador_ixc_id AS "operadorIxcId",
       o.diagnostico_snapshot AS "diagnostico",
       o.mensagem,
       o.tarefa_snapshot AS "tarefa",
       o.status_ocorrencia AS "statusOcorrencia",
       o.aberto_em AS "abertoEm",
       o.fechado_em AS "fechadoEm"
     FROM ocorrencias_ixc o
     WHERE ${condicoes().sql}
     ORDER BY o.fechado_em`,
    parametros(periodo),
  );
}

export async function contar(periodo: PeriodoAuditorias): Promise<number> {
  const linhas = await consultar<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ocorrencias_ixc o WHERE ${condicoes().sql}`,
    parametros(periodo),
  );

  return Number(linhas[0]?.total ?? 0);
}

export async function resumir(periodo: PeriodoAuditorias): Promise<{
  grupos: GrupoAuditoriaLocal[];
  intervalos: IntervaloAuditorLocal[];
}> {
  const filtro = condicoes().sql;
  const valores = parametros(periodo);

  const [grupos, intervalos] = await Promise.all([
    consultar<GrupoAuditoriaLocal>(
      `SELECT
         o.operador_ixc_id AS "operadorIxcId",
         o.auditor_nome_snapshot AS "auditorNome",
         o.assunto_ixc_id AS "assuntoIxcId",
         o.assunto_snapshot AS "assunto",
         o.diagnostico_snapshot AS "diagnostico",
         o.tarefa_snapshot AS "tarefa",
         COUNT(*)::text AS total
       FROM ocorrencias_ixc o
       WHERE ${filtro}
       GROUP BY 1, 2, 3, 4, 5, 6`,
      valores,
    ),
    consultar<IntervaloAuditorLocal>(
      `SELECT
         "operadorIxcId",
         AVG(minutos)::text AS "intervaloMedioMinutos",
         COUNT(minutos)::text AS intervalos
       FROM (
         SELECT
           o.operador_ixc_id AS "operadorIxcId",
           EXTRACT(EPOCH FROM (
             o.fechado_em - LAG(o.fechado_em) OVER (
               PARTITION BY o.operador_ixc_id, o.fechado_em::date
               ORDER BY o.fechado_em
             )
           )) / 60 AS minutos
         FROM ocorrencias_ixc o
         WHERE ${filtro}
       ) baixas
       WHERE minutos IS NOT NULL
       GROUP BY "operadorIxcId"`,
      valores,
    ),
  ]);

  return { grupos, intervalos };
}
