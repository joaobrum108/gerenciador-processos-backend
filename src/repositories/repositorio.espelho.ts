import { consultar } from "../database/pool.ts";
import type { OcorrenciaBruta } from "./repositorio.sincronizacao.ixc.ts";

const COLUNAS = [
  "ocorrencia_ixc_id",
  "chamado_ixc_id",
  "ticket_ixc_id",
  "setor_snapshot",
  "operador_ixc_id",
  "auditor_nome_snapshot",
  "funcionario_ixc_id",
  "funcionario_nome_snapshot",
  "tecnico_ixc_id",
  "tecnico_nome_snapshot",
  "assunto_ixc_id",
  "assunto_snapshot",
  "titulo_os_snapshot",
  "diagnostico_ixc_id",
  "diagnostico_snapshot",
  "tarefa_snapshot",
  "tarefa_chamado_snapshot",
  "mensagem",
  "cliente_ixc_id",
  "cliente_nome_snapshot",
  "status_ocorrencia",
  "aberto_em",
  "fechado_em",
] as const;

function valores(ocorrencia: OcorrenciaBruta): unknown[] {
  return [
    ocorrencia.ocorrenciaIxcId,
    ocorrencia.chamadoIxcId,
    ocorrencia.ticketIxcId,
    ocorrencia.setorSnapshot,
    ocorrencia.operadorIxcId,
    ocorrencia.auditorNomeSnapshot,
    ocorrencia.funcionarioIxcId,
    ocorrencia.funcionarioNomeSnapshot,
    ocorrencia.tecnicoIxcId,
    ocorrencia.tecnicoNomeSnapshot,
    ocorrencia.assuntoIxcId,
    ocorrencia.assuntoSnapshot,
    ocorrencia.tituloOsSnapshot,
    ocorrencia.diagnosticoIxcId,
    ocorrencia.diagnosticoSnapshot,
    ocorrencia.tarefaSnapshot,
    ocorrencia.tarefaChamadoSnapshot,
    ocorrencia.mensagem,
    ocorrencia.clienteIxcId,
    ocorrencia.clienteNomeSnapshot,
    ocorrencia.statusOcorrencia,
    ocorrencia.abertoEm,
    ocorrencia.fechadoEm,
  ];
}

const ATUALIZAVEIS = COLUNAS.filter(
  (coluna) => coluna !== "ocorrencia_ixc_id",
);

export async function gravarLote(
  ocorrencias: OcorrenciaBruta[],
): Promise<number> {
  if (ocorrencias.length === 0) return 0;

  const marcadores = ocorrencias
    .map(
      (_, linha) =>
        `(${COLUNAS.map(
          (__, coluna) => `$${linha * COLUNAS.length + coluna + 1}`,
        ).join(", ")})`,
    )
    .join(", ");

  const atualizacao = ATUALIZAVEIS.map(
    (coluna) => `"${coluna}" = EXCLUDED."${coluna}"`,
  ).join(", ");

  const gravadas = await consultar<{ ocorrencia_ixc_id: string }>(
    `INSERT INTO ocorrencias_ixc (${COLUNAS.map((c) => `"${c}"`).join(", ")})
     VALUES ${marcadores}
     ON CONFLICT ("ocorrencia_ixc_id") DO UPDATE
       SET ${atualizacao}, "sincronizado_em" = CURRENT_TIMESTAMP
     RETURNING "ocorrencia_ixc_id"`,
    ocorrencias.flatMap(valores),
  );

  return gravadas.length;
}

export const MAXIMO_POR_LOTE = Math.floor(60_000 / COLUNAS.length);

export async function gravar(ocorrencias: OcorrenciaBruta[]): Promise<number> {
  let gravadas = 0;

  for (let inicio = 0; inicio < ocorrencias.length; inicio += MAXIMO_POR_LOTE) {
    gravadas += await gravarLote(
      ocorrencias.slice(inicio, inicio + MAXIMO_POR_LOTE),
    );
  }

  return gravadas;
}

export interface CorridaSincronizacao {
  id: string;
  marcaDaguaAte: Date | null;
}

export async function ultimaMarcaDagua(): Promise<Date | null> {
  const linhas = await consultar<{ marcaDaguaAte: Date | null }>(
    `SELECT marca_dagua_ate AS "marcaDaguaAte"
       FROM sincronizacoes_ixc
      WHERE situacao = 'CONCLUIDA'
      ORDER BY iniciada_em DESC
      LIMIT 1`,
  );

  return linhas[0]?.marcaDaguaAte ?? null;
}

export async function abrirCorrida(
  marcaDaguaDe: Date | null,
  marcaDaguaAte: Date | null,
  janelaRelidaDe: Date | null,
): Promise<string> {
  const linhas = await consultar<{ id: string }>(
    `INSERT INTO sincronizacoes_ixc (marca_dagua_de, marca_dagua_ate, janela_relida_de)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [marcaDaguaDe, marcaDaguaAte, janelaRelidaDe],
  );

  return linhas[0]!.id;
}

export async function concluirCorrida(
  id: string,
  linhasLidas: number,
  linhasGravadas: number,
): Promise<void> {
  await consultar(
    `UPDATE sincronizacoes_ixc
        SET situacao = 'CONCLUIDA',
            linhas_lidas = $2,
            linhas_gravadas = $3,
            concluida_em = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, linhasLidas, linhasGravadas],
  );
}

export async function falharCorrida(id: string, erro: string): Promise<void> {
  await consultar(
    `UPDATE sincronizacoes_ixc
        SET situacao = 'FALHOU', erro = $2, concluida_em = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, erro],
  );
}

export async function liberarCorridasTravadas(): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    `UPDATE sincronizacoes_ixc
        SET situacao = 'FALHOU',
            erro = 'Corrida interrompida sem conclusao',
            concluida_em = CURRENT_TIMESTAMP
      WHERE situacao = 'EM_ANDAMENTO'
      RETURNING id`,
  );

  return linhas.length;
}

export async function contarEspelho(): Promise<number> {
  const linhas = await consultar<{ total: string }>(
    "SELECT COUNT(*) AS total FROM ocorrencias_ixc",
  );

  return Number(linhas[0]?.total ?? 0);
}
