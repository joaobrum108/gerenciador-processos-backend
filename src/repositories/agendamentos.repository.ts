import { consultar } from "../database/pool.ts";

export interface AgendamentoRegistro {
  id: string;
  setor: string;
  tecnicoIxcId: string;
  tecnicoNomeSnapshot: string;
  tecnicoSiglaSnapshot: string | null;
  baseIxcId: string | null;
  baseNomeSnapshot: string | null;
  tipo: string;
  data: string;
  hora: string;
  status: string;
  observacoes: string | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface FiltrosAgendamento {
  setor: string;
  tecnicoIxcId?: string | undefined;
  status?: string | undefined;
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
}

export interface DadosAgendamento {
  setor: string;
  tecnicoIxcId: string;
  tecnicoNomeSnapshot: string;
  tecnicoSiglaSnapshot: string | null;
  baseIxcId: string | null;
  baseNomeSnapshot: string | null;
  tipo: string;
  data: string;
  hora: string;
  status: string;
  observacoes: string | null;
  criadoPorUsuarioId: string;
}

export interface DadosCancelamento {
  canceladoPorUsuarioId: string;
  motivo: string;
}

const COLUNAS = `
  id,
  setor,
  tecnico_ixc_id AS "tecnicoIxcId",
  tecnico_nome_snapshot AS "tecnicoNomeSnapshot",
  tecnico_sigla_snapshot AS "tecnicoSiglaSnapshot",
  base_ixc_id AS "baseIxcId",
  base_nome_snapshot AS "baseNomeSnapshot",
  tipo,
  to_char(data, 'YYYY-MM-DD') AS "data",
  to_char(hora, 'HH24:MI') AS "hora",
  status,
  observacoes,
  cancelado_em AS "canceladoEm",
  motivo_cancelamento AS "motivoCancelamento",
  criado_em AS "criadoEm",
  atualizado_em AS "atualizadoEm"
`;

export async function listar(
  filtros: FiltrosAgendamento,
): Promise<AgendamentoRegistro[]> {
  const condicoes = ["setor = $1::setor"];
  const parametros: unknown[] = [filtros.setor];

  if (filtros.tecnicoIxcId) {
    parametros.push(filtros.tecnicoIxcId);
    condicoes.push(`tecnico_ixc_id = $${parametros.length}`);
  }

  if (filtros.status) {
    parametros.push(filtros.status);
    condicoes.push(`status = $${parametros.length}::status_agendamento`);
  }

  if (filtros.dataInicio) {
    parametros.push(filtros.dataInicio);
    condicoes.push(`data >= $${parametros.length}`);
  }

  if (filtros.dataFim) {
    parametros.push(filtros.dataFim);
    condicoes.push(`data <= $${parametros.length}`);
  }

  return consultar<AgendamentoRegistro>(
    `SELECT ${COLUNAS} FROM agendamentos
      WHERE ${condicoes.join(" AND ")}
      ORDER BY data, hora, tecnico_nome_snapshot`,
    parametros,
  );
}

export async function buscarPorId(
  id: string,
): Promise<AgendamentoRegistro | null> {
  const linhas = await consultar<AgendamentoRegistro>(
    `SELECT ${COLUNAS} FROM agendamentos WHERE id = $1`,
    [id],
  );

  return linhas[0] ?? null;
}

/**
 * Espelha o indice unico parcial `agendamentos_slot_agendado_key`: o mesmo
 * tecnico nao pode ter dois agendamentos AGENDADO no mesmo setor, dia e hora.
 * Checar antes permite devolver 409 com mensagem util em vez de deixar o
 * INSERT estourar como violacao de constraint.
 */
export async function buscarSlotOcupado(
  setor: string,
  tecnicoIxcId: string,
  data: string,
  hora: string,
  ignorarId: string | null = null,
): Promise<{ id: string } | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT id FROM agendamentos
      WHERE setor = $1::setor
        AND tecnico_ixc_id = $2
        AND data = $3
        AND hora = $4::time
        AND status = 'AGENDADO'
        AND ($5::uuid IS NULL OR id <> $5::uuid)
      LIMIT 1`,
    [setor, tecnicoIxcId, data, hora, ignorarId],
  );

  return linhas[0] ?? null;
}

export async function inserirVarios(
  dados: DadosAgendamento[],
): Promise<AgendamentoRegistro[]> {
  const criados: AgendamentoRegistro[] = [];

  for (const item of dados) {
    const linhas = await consultar<AgendamentoRegistro>(
      `INSERT INTO agendamentos (
         setor, tecnico_ixc_id, tecnico_nome_snapshot, tecnico_sigla_snapshot,
         base_ixc_id, base_nome_snapshot, tipo, data, hora, status,
         observacoes, criado_por_usuario_id
       ) VALUES (
         $1::setor, $2, $3, $4, $5, $6, $7::tipo_checklist, $8, $9::time,
         $10::status_agendamento, $11, $12
       )
       RETURNING ${COLUNAS}`,
      [
        item.setor,
        item.tecnicoIxcId,
        item.tecnicoNomeSnapshot,
        item.tecnicoSiglaSnapshot,
        item.baseIxcId,
        item.baseNomeSnapshot,
        item.tipo,
        item.data,
        item.hora,
        item.status,
        item.observacoes,
        item.criadoPorUsuarioId,
      ],
    );

    criados.push(linhas[0]!);
  }

  return criados;
}

export async function atualizarDataHora(
  id: string,
  data: string,
  hora: string,
): Promise<AgendamentoRegistro | null> {
  const linhas = await consultar<AgendamentoRegistro>(
    `UPDATE agendamentos SET data = $2, hora = $3::time
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [id, data, hora],
  );

  return linhas[0] ?? null;
}

export async function atualizarStatus(
  id: string,
  status: string,
  cancelamento: DadosCancelamento | null,
): Promise<AgendamentoRegistro | null> {
  const linhas = await consultar<AgendamentoRegistro>(
    `UPDATE agendamentos SET
       status = $2::status_agendamento,
       cancelado_em = CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END,
       cancelado_por_usuario_id = $3::uuid,
       motivo_cancelamento = $4
     WHERE id = $1
     RETURNING ${COLUNAS}`,
    [
      id,
      status,
      cancelamento?.canceladoPorUsuarioId ?? null,
      cancelamento?.motivo ?? null,
    ],
  );

  return linhas[0] ?? null;
}
