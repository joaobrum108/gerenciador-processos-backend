import { consultarIxc } from "../database/pool.ixc.ts";

export interface DivergenciaIxc {
  ocorrenciaIxcId: number;
  chamadoIxcId: number;
  ticketIxcId: number | null;
  clienteIxcId: number | null;
  clienteNome: string | null;
  tituloOs: string | null;
  assuntoIxcId: number;
  assunto: string;
  diagnosticoIxcId: number;
  diagnostico: string;
  tecnicoIxcId: number | null;
  tecnicoNome: string | null;
  auditorIxcId: number | null;
  auditorNome: string | null;
  abertoEm: string;
  fechadoEm: string;
}

export interface PeriodoDivergencias {
  dataInicio: string;

  dataFim: string;
}

export async function listar(
  periodo: PeriodoDivergencias,
): Promise<DivergenciaIxc[]> {
  return consultarIxc<DivergenciaIxc>(
    `SELECT
  su_oss_chamado_mensagem.id AS ocorrenciaIxcId,
  su_oss_chamado_mensagem.id_chamado AS chamadoIxcId,
  su_oss_chamado_mensagem_su_oss_chamado.id_ticket AS ticketIxcId,
  su_ticket_cliente.id AS clienteIxcId,
  su_ticket_cliente.razao AS clienteNome,
  su_oss_chamado_su_ticket.titulo AS tituloOs,
  su_oss_chamado_mensagem_su_oss_chamado.id_assunto AS assuntoIxcId,
  su_oss_chamado_su_oss_assunto.assunto AS assunto,
  su_oss_chamado_mensagem.id_su_diagnostico AS diagnosticoIxcId,
  su_oss_chamado_mensagem_su_diagnostico.descricao AS diagnostico,
  su_oss_chamado_mensagem.id_tecnico AS tecnicoIxcId,
  su_oss_chamado_mensagem_funcionarios.funcionario AS tecnicoNome,
  su_oss_chamado_mensagem.id_operador AS auditorIxcId,
  NULL AS auditorNome,
  DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_abertura, "%d/%m/%Y %H:%i:%s") AS abertoEm,
  DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_fechamento, "%d/%m/%Y %H:%i:%s") AS fechadoEm
FROM su_oss_chamado_mensagem
LEFT JOIN funcionarios su_oss_chamado_mensagem_funcionarios ON su_oss_chamado_mensagem.id_tecnico = su_oss_chamado_mensagem_funcionarios.id
LEFT JOIN su_oss_chamado su_oss_chamado_mensagem_su_oss_chamado ON su_oss_chamado_mensagem.id_chamado = su_oss_chamado_mensagem_su_oss_chamado.id
LEFT JOIN su_oss_assunto su_oss_chamado_su_oss_assunto ON su_oss_chamado_mensagem_su_oss_chamado.id_assunto = su_oss_chamado_su_oss_assunto.id
LEFT JOIN su_ticket su_oss_chamado_su_ticket ON su_oss_chamado_mensagem_su_oss_chamado.id_ticket = su_oss_chamado_su_ticket.id
LEFT JOIN empresa_setor su_oss_assunto_empresa_setor ON su_oss_chamado_su_oss_assunto.setor_su_oss_chamado = su_oss_assunto_empresa_setor.id
LEFT JOIN su_diagnostico su_oss_chamado_mensagem_su_diagnostico ON su_oss_chamado_mensagem.id_su_diagnostico = su_oss_chamado_mensagem_su_diagnostico.id
LEFT JOIN cliente su_ticket_cliente ON su_oss_chamado_su_ticket.id_cliente = su_ticket_cliente.id WHERE (su_oss_chamado_mensagem.status = 'F' AND su_oss_chamado_su_oss_assunto.assunto LIKE '%DIVERGENCIA DE O.S%' AND (su_oss_chamado_mensagem_su_oss_chamado.data_fechamento BETWEEN ? AND ?) AND (su_ticket_cliente.razao NOT LIKE '%TESTE-REDFOX%' OR su_ticket_cliente.razao NOT LIKE '%CLIENTE REDFOX TESTE1%') AND (su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%RES -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%DSL -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%COR -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%INF -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%TER -%') AND (su_oss_chamado_mensagem_su_diagnostico.descricao NOT LIKE '%AUDITORIA CONCLUIDA%'))
`,
    [`${periodo.dataInicio} 00:00:00`, `${periodo.dataFim} 23:59:59`],
  );
}

export interface OperadorIxc {
  id: number;
  nome: string;
}

export async function buscarNomesOperadores(
  ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const marcadores = ids.map(() => "?").join(", ");

  const operadores = await consultarIxc<OperadorIxc>(
    `SELECT u.id, u.nome
       FROM usuarios u
      WHERE u.id IN (${marcadores})`,
    ids,
  );

  return new Map(operadores.map((operador) => [operador.id, operador.nome]));
}
