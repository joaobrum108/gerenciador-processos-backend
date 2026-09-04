import { consultarIxc } from "../database/pool.ixc.ts";
import { margemUltimaAtualizacao } from "./margem.ixc.ts";

export interface OcorrenciaBruta {
  ocorrenciaIxcId: number;
  chamadoIxcId: number;
  ticketIxcId: number | null;
  setorSnapshot: string | null;
  operadorIxcId: number | null;
  auditorNomeSnapshot: string | null;
  funcionarioIxcId: number | null;
  funcionarioNomeSnapshot: string | null;
  tecnicoIxcId: number | null;
  tecnicoNomeSnapshot: string | null;
  assuntoIxcId: number | null;
  assuntoSnapshot: string | null;
  tituloOsSnapshot: string | null;
  diagnosticoIxcId: number | null;
  diagnosticoSnapshot: string | null;
  tarefaSnapshot: string | null;
  tarefaChamadoSnapshot: string | null;
  mensagem: string | null;
  clienteIxcId: number | null;
  clienteNomeSnapshot: string | null;
  statusOcorrencia: string | null;
  abertoEm: Date;
  fechadoEm: Date;
}

export interface JanelaLeitura {
  desde: Date;
  ate: Date;
}

function ehTecnicoDeCampo(coluna: string): string {
  return `(${coluna} LIKE '%RES -%' OR ${coluna} LIKE '%DSL -%'
    OR ${coluna} LIKE '%COR -%' OR ${coluna} LIKE '%INF -%'
    OR ${coluna} LIKE '%TER -%')`;
}

const COLUNAS = `
  m.id AS ocorrenciaIxcId,
  m.id_chamado AS chamadoIxcId,
  c.id_ticket AS ticketIxcId,
  s.setor AS setorSnapshot,
  m.id_operador AS operadorIxcId,
  u.nome AS auditorNomeSnapshot,
  m.id_tecnico AS funcionarioIxcId,
  fm.funcionario AS funcionarioNomeSnapshot,
  CASE WHEN ${ehTecnicoDeCampo("fm.funcionario")}
       THEN m.id_tecnico ELSE fc.id END AS tecnicoIxcId,
  CASE WHEN ${ehTecnicoDeCampo("fm.funcionario")}
       THEN fm.funcionario ELSE fc.funcionario END AS tecnicoNomeSnapshot,
  c.id_assunto AS assuntoIxcId,
  a.assunto AS assuntoSnapshot,
  tk.titulo AS tituloOsSnapshot,
  m.id_su_diagnostico AS diagnosticoIxcId,
  d.descricao AS diagnosticoSnapshot,
  tm.descricao AS tarefaSnapshot,
  tc.descricao AS tarefaChamadoSnapshot,
  m.mensagem AS mensagem,
  COALESCE(c.id_cliente, tk.id_cliente) AS clienteIxcId,
  COALESCE(clc.razao, clt.razao) AS clienteNomeSnapshot,
  m.status AS statusOcorrencia,
  c.data_abertura AS abertoEm,
  c.data_fechamento AS fechadoEm
`;

const FONTE = `
FROM su_oss_chamado_mensagem m
LEFT JOIN su_oss_chamado c ON m.id_chamado = c.id
LEFT JOIN su_oss_assunto a ON c.id_assunto = a.id
LEFT JOIN empresa_setor s ON c.setor = s.id
LEFT JOIN usuarios u ON m.id_operador = u.id
LEFT JOIN funcionarios fm ON m.id_tecnico = fm.id
LEFT JOIN funcionarios fc ON c.id_tecnico = fc.id
LEFT JOIN su_ticket tk ON c.id_ticket = tk.id
LEFT JOIN cliente clc ON c.id_cliente = clc.id
LEFT JOIN cliente clt ON tk.id_cliente = clt.id
LEFT JOIN su_diagnostico d ON m.id_su_diagnostico = d.id
LEFT JOIN wfl_tarefa tm ON m.id_proxima_tarefa = tm.id
LEFT JOIN wfl_tarefa tc ON c.id_wfl_tarefa = tc.id
WHERE s.setor LIKE '%AUDITORIA%'
  AND m.status <> 'A'
  AND c.data_fechamento IS NOT NULL
`;

function diaIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export async function lerPorFechamento(
  janela: JanelaLeitura,
): Promise<OcorrenciaBruta[]> {
  return consultarIxc<OcorrenciaBruta>(
    `SELECT ${COLUNAS} ${FONTE}
       AND c.ultima_atualizacao >= DATE_SUB(?, INTERVAL ? DAY)
       AND c.data_fechamento BETWEEN ? AND ?`,
    [
      janela.desde,
      margemUltimaAtualizacao(diaIso(janela.desde)),
      janela.desde,
      janela.ate,
    ],
  );
}

export async function lerPorAtualizacao(
  janela: JanelaLeitura,
): Promise<OcorrenciaBruta[]> {
  return consultarIxc<OcorrenciaBruta>(
    `SELECT ${COLUNAS} ${FONTE} AND c.ultima_atualizacao BETWEEN ? AND ?`,
    [janela.desde, janela.ate],
  );
}

export async function contarPorFechamento(
  janela: JanelaLeitura,
): Promise<number> {
  const linhas = await consultarIxc<{ total: number }>(
    `SELECT COUNT(*) AS total ${FONTE}
       AND c.ultima_atualizacao >= DATE_SUB(?, INTERVAL ? DAY)
       AND c.data_fechamento BETWEEN ? AND ?`,
    [
      janela.desde,
      margemUltimaAtualizacao(diaIso(janela.desde)),
      janela.desde,
      janela.ate,
    ],
  );

  return Number(linhas[0]?.total ?? 0);
}
