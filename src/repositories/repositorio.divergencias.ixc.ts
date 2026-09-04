import { consultarIxc } from "../database/pool.ixc.ts";
import { comCache, ttlDoPeriodo } from "../database/cache.ixc.ts";
import { margemUltimaAtualizacao } from "./margem.ixc.ts";

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
  observacao: string | null;
  tipoDivergencia: string | null;
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
  return comCache(
    `divergencias:${periodo.dataInicio}:${periodo.dataFim}`,
    ttlDoPeriodo(periodo.dataFim),
    () =>
      consultarIxc<DivergenciaIxc>(
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
  CASE WHEN (su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%RES -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%DSL -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%COR -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%INF -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%TER -%')
       THEN su_oss_chamado_mensagem.id_tecnico
       ELSE su_oss_chamado_funcionarios.id END AS tecnicoIxcId,
  CASE WHEN (su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%RES -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%DSL -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%COR -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%INF -%'
             OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%TER -%')
       THEN su_oss_chamado_mensagem_funcionarios.funcionario
       ELSE su_oss_chamado_funcionarios.funcionario END AS tecnicoNome,
    su_oss_chamado_mensagem.id_operador AS auditorIxcId,
    NULL AS auditorNome,
    su_oss_chamado_mensagem.mensagem AS observacao,
    su_oss_chamado_wfl_tarefa.descricao AS tipoDivergencia,
    DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_abertura, "%d/%m/%Y %H:%i:%s") AS abertoEm,
    DATE_FORMAT(su_oss_chamado_mensagem_su_oss_chamado.data_fechamento, "%d/%m/%Y %H:%i:%s") AS fechadoEm
  FROM su_oss_chamado_mensagem
  LEFT JOIN funcionarios su_oss_chamado_mensagem_funcionarios ON su_oss_chamado_mensagem.id_tecnico = su_oss_chamado_mensagem_funcionarios.id
  LEFT JOIN su_oss_chamado su_oss_chamado_mensagem_su_oss_chamado ON su_oss_chamado_mensagem.id_chamado = su_oss_chamado_mensagem_su_oss_chamado.id
  LEFT JOIN funcionarios su_oss_chamado_funcionarios ON su_oss_chamado_mensagem_su_oss_chamado.id_tecnico = su_oss_chamado_funcionarios.id
  LEFT JOIN wfl_tarefa su_oss_chamado_wfl_tarefa ON su_oss_chamado_mensagem_su_oss_chamado.id_wfl_tarefa = su_oss_chamado_wfl_tarefa.id
  LEFT JOIN su_oss_assunto su_oss_chamado_su_oss_assunto ON su_oss_chamado_mensagem_su_oss_chamado.id_assunto = su_oss_chamado_su_oss_assunto.id
  LEFT JOIN su_ticket su_oss_chamado_su_ticket ON su_oss_chamado_mensagem_su_oss_chamado.id_ticket = su_oss_chamado_su_ticket.id
  LEFT JOIN empresa_setor su_oss_assunto_empresa_setor ON su_oss_chamado_su_oss_assunto.setor_su_oss_chamado = su_oss_assunto_empresa_setor.id
  LEFT JOIN su_diagnostico su_oss_chamado_mensagem_su_diagnostico ON su_oss_chamado_mensagem.id_su_diagnostico = su_oss_chamado_mensagem_su_diagnostico.id
  LEFT JOIN cliente su_ticket_cliente ON su_oss_chamado_su_ticket.id_cliente = su_ticket_cliente.id WHERE (su_oss_chamado_mensagem_su_oss_chamado.ultima_atualizacao >= DATE_SUB(?, INTERVAL ? DAY) AND su_oss_chamado_mensagem.status = 'F' AND su_oss_chamado_su_oss_assunto.assunto LIKE '%DIVERGENCIA DE O.S%' AND (su_oss_chamado_mensagem_su_oss_chamado.data_fechamento BETWEEN ? AND ?) AND (su_ticket_cliente.razao NOT LIKE '%TESTE-REDFOX%' AND su_ticket_cliente.razao NOT LIKE '%CLIENTE REDFOX TESTE1%') AND (su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%RES -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%DSL -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%COR -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%INF -%' OR su_oss_chamado_mensagem_funcionarios.funcionario LIKE '%TER -%' OR su_oss_chamado_funcionarios.funcionario LIKE '%RES -%' OR su_oss_chamado_funcionarios.funcionario LIKE '%DSL -%' OR su_oss_chamado_funcionarios.funcionario LIKE '%COR -%' OR su_oss_chamado_funcionarios.funcionario LIKE '%INF -%' OR su_oss_chamado_funcionarios.funcionario LIKE '%TER -%') AND (su_oss_chamado_mensagem_su_diagnostico.descricao NOT LIKE '%AUDITORIA CONCLUIDA%'))
`,
        [
          `${periodo.dataInicio} 00:00:00`,
          margemUltimaAtualizacao(periodo.dataInicio),
          `${periodo.dataInicio} 00:00:00`,
          `${periodo.dataFim} 23:59:59`,
        ],
      ),
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
