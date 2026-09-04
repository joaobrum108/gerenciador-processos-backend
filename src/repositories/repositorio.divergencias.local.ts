import { consultar } from "../database/pool.ts";

export interface DivergenciaLocal {
  ocorrenciaIxcId: string;
  chamadoIxcId: string;
  ticketIxcId: string | null;
  clienteIxcId: number | null;
  clienteNome: string | null;
  tituloOs: string | null;
  assuntoIxcId: number | null;
  assunto: string | null;
  diagnosticoIxcId: number | null;
  diagnostico: string | null;
  tecnicoIxcId: number | null;
  tecnicoNome: string | null;
  auditorIxcId: number | null;
  auditorNome: string | null;
  observacao: string | null;
  tipoDivergencia: string | null;
  abertoEm: Date;
  fechadoEm: Date;
}

export interface PeriodoDivergencias {
  dataInicio: string;
  dataFim: string;
}

const PREFIXOS_TECNICO_CAMPO = ["RES -", "DSL -", "COR -", "INF -", "TER -"];

const CLIENTES_DE_TESTE = ["%TESTE-REDFOX%", "%CLIENTE REDFOX TESTE1%"];

const FILTRO_TECNICO_CAMPO = PREFIXOS_TECNICO_CAMPO.map(
  (_, i) => `o.tecnico_nome_snapshot LIKE $${i + 3}`,
).join(" OR ");

const FILTRO_CLIENTE_TESTE = CLIENTES_DE_TESTE.map(
  (_, i) => `COALESCE(o.cliente_nome_snapshot, '') NOT LIKE $${i + 8}`,
).join(" AND ");

export async function listar(
  periodo: PeriodoDivergencias,
): Promise<DivergenciaLocal[]> {
  return consultar<DivergenciaLocal>(
    `SELECT
       o.ocorrencia_ixc_id::text AS "ocorrenciaIxcId",
       o.chamado_ixc_id::text AS "chamadoIxcId",
       o.ticket_ixc_id::text AS "ticketIxcId",
       o.cliente_ixc_id AS "clienteIxcId",
       o.cliente_nome_snapshot AS "clienteNome",
       o.titulo_os_snapshot AS "tituloOs",
       o.assunto_ixc_id AS "assuntoIxcId",
       o.assunto_snapshot AS "assunto",
       o.diagnostico_ixc_id AS "diagnosticoIxcId",
       o.diagnostico_snapshot AS "diagnostico",
       o.tecnico_ixc_id AS "tecnicoIxcId",
       o.tecnico_nome_snapshot AS "tecnicoNome",
       o.operador_ixc_id AS "auditorIxcId",
       o.auditor_nome_snapshot AS "auditorNome",
       o.mensagem AS "observacao",
       o.tarefa_chamado_snapshot AS "tipoDivergencia",
       o.aberto_em AS "abertoEm",
       o.fechado_em AS "fechadoEm"
     FROM ocorrencias_ixc o
     WHERE o.fechado_em >= $1::date
       AND o.fechado_em < ($2::date + INTERVAL '1 day')
       AND o.status_ocorrencia = 'F'
       AND o.assunto_snapshot ILIKE '%DIVERGENCIA DE O.S%'
       AND (${FILTRO_TECNICO_CAMPO})
       AND ${FILTRO_CLIENTE_TESTE}
       AND COALESCE(o.diagnostico_snapshot, '') NOT ILIKE '%AUDITORIA CONCLUIDA%'
     ORDER BY o.fechado_em`,
    [
      periodo.dataInicio,
      periodo.dataFim,
      ...PREFIXOS_TECNICO_CAMPO.map((prefixo) => `%${prefixo}%`),
      ...CLIENTES_DE_TESTE,
    ],
  );
}
