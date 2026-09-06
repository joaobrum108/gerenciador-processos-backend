import { consultar } from "../database/pool.ts";

export interface RegistroDevolucaoRegistro {
  id: string;
  numero: string;
  dataRetirada: string;
  dataDevolucao: string | null;
  funcionarioIxcId: string;
  funcionarioNomeSnapshot: string;
  baseIxcId: string | null;
  baseNomeSnapshot: string | null;
  classeNomeSnapshot: string | null;
  auditorUsuarioId: string;
  clienteIxcId: string | null;
  clienteCodigoSnapshot: string | null;
  clienteNomeSnapshot: string | null;
  modeloIxcId: string | null;
  modeloNomeSnapshot: string;
  mac: string | null;
  serialNumber: string;
  motivoId: string;
  motivoNome: string;
  paradeiroId: string;
  paradeiroNome: string;
  recebimento: string;
  status: string;
  observacao: string | null;
  conciliadoIxc: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface FiltrosListagem {
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
  somenteDuplicados?: boolean | undefined;
}

export interface Ordenacao {
  ordenarPor: string;
  ordem: "asc" | "desc";
  pagina: number;
  porPagina: number;
}

export interface DadosRegistro {
  dataRetirada: string;
  dataDevolucao: string | null;
  funcionarioIxcId: string;
  funcionarioNomeSnapshot: string;
  baseIxcId: string | null;
  baseNomeSnapshot: string | null;
  classeNomeSnapshot: string | null;
  clienteIxcId: string | null;
  clienteCodigoSnapshot: string | null;
  clienteNomeSnapshot: string | null;
  modeloIxcId: string | null;
  modeloNomeSnapshot: string;
  mac: string;
  serialNumber: string;
  motivoId: string;
  paradeiroId: string;
  recebimento: string;
  status: string;
  observacao: string | null;
  conciliadoIxc: boolean;
  auditorUsuarioId: string;
  criadoPorUsuarioId: string;
}

// Espelha os indices normalizados da tabela, para que o filtro de duplicados e a
// checagem de equipamento repetido usem exatamente a mesma chave que o banco indexa.
const MAC_NORMALIZADO = `upper(replace(replace(r.mac, ':', ''), '-', ''))`;
const SERIAL_NORMALIZADO = `upper(btrim(r.serial_number))`;

const COLUNAS = `
  r.id,
  r.numero::text AS "numero",
  to_char(r.data_retirada, 'YYYY-MM-DD') AS "dataRetirada",
  to_char(r.data_devolucao, 'YYYY-MM-DD') AS "dataDevolucao",
  r.funcionario_ixc_id AS "funcionarioIxcId",
  r.funcionario_nome_snapshot AS "funcionarioNomeSnapshot",
  r.base_ixc_id AS "baseIxcId",
  r.base_nome_snapshot AS "baseNomeSnapshot",
  r.classe_nome_snapshot AS "classeNomeSnapshot",
  r.auditor_usuario_id AS "auditorUsuarioId",
  r.cliente_ixc_id AS "clienteIxcId",
  r.cliente_codigo_snapshot AS "clienteCodigoSnapshot",
  r.cliente_nome_snapshot AS "clienteNomeSnapshot",
  r.modelo_ixc_id AS "modeloIxcId",
  r.modelo_nome_snapshot AS "modeloNomeSnapshot",
  r.mac,
  r.serial_number AS "serialNumber",
  r.motivo_id AS "motivoId",
  m.nome AS "motivoNome",
  r.paradeiro_id AS "paradeiroId",
  p.nome AS "paradeiroNome",
  r.recebimento,
  r.status,
  r.observacao,
  r.conciliado_ixc AS "conciliadoIxc",
  r.criado_em AS "criadoEm",
  r.atualizado_em AS "atualizadoEm"
`;

const JUNCOES = `
  FROM registros_devolucao r
  JOIN motivos_devolucao m ON m.id = r.motivo_id
  JOIN paradeiros p ON p.id = r.paradeiro_id
`;

// Um MAC nulo nao conta como repetido: sem o guarda, o PARTITION BY agruparia
// todos os nulos e marcaria a lista inteira como duplicada.
const IDS_DUPLICADOS = `
  SELECT id FROM (
    SELECT
      r.id,
      r.mac,
      count(*) OVER (PARTITION BY ${MAC_NORMALIZADO}) AS por_mac,
      count(*) OVER (PARTITION BY ${SERIAL_NORMALIZADO}) AS por_serial
    FROM registros_devolucao r
    WHERE r.excluido_em IS NULL AND r.status = 'PENDENTE'
  ) c
  WHERE (c.mac IS NOT NULL AND c.por_mac > 1) OR c.por_serial > 1
`;

export const ORDENACOES_PERMITIDAS = [
  "dataRetirada",
  "numero",
  "funcionarioNomeSnapshot",
  "status",
  "criadoEm",
];

const COLUNAS_ORDENAVEIS: Record<string, string> = {
  dataRetirada: "r.data_retirada",
  numero: "r.numero",
  funcionarioNomeSnapshot: "r.funcionario_nome_snapshot",
  status: "r.status",
  criadoEm: "r.criado_em",
};

function montarFiltros(
  filtros: FiltrosListagem,
): { clausula: string; parametros: unknown[] } {
  const condicoes = ["r.excluido_em IS NULL"];
  const parametros: unknown[] = [];

  if (filtros.dataInicio) {
    parametros.push(filtros.dataInicio);
    condicoes.push(`r.data_retirada >= $${parametros.length}`);
  }

  if (filtros.dataFim) {
    parametros.push(filtros.dataFim);
    condicoes.push(`r.data_retirada <= $${parametros.length}`);
  }

  if (filtros.somenteDuplicados) {
    condicoes.push(`r.id IN (${IDS_DUPLICADOS})`);
  }

  return { clausula: `WHERE ${condicoes.join(" AND ")}`, parametros };
}

export async function listar(
  filtros: FiltrosListagem,
  ordenacao: Ordenacao,
): Promise<RegistroDevolucaoRegistro[]> {
  const { clausula, parametros } = montarFiltros(filtros);

  // ordenarPor ja vem validado por z.enum no controller; o mapa e a segunda
  // barreira, porque o valor entra concatenado na clausula ORDER BY.
  const coluna = COLUNAS_ORDENAVEIS[ordenacao.ordenarPor] ?? "r.data_retirada";
  const direcao = ordenacao.ordem === "asc" ? "ASC" : "DESC";

  const limite = parametros.length + 1;
  const deslocamento = parametros.length + 2;

  return consultar<RegistroDevolucaoRegistro>(
    `SELECT ${COLUNAS} ${JUNCOES} ${clausula}
      ORDER BY ${coluna} ${direcao}, r.numero DESC
      LIMIT $${limite} OFFSET $${deslocamento}`,
    [
      ...parametros,
      ordenacao.porPagina,
      (ordenacao.pagina - 1) * ordenacao.porPagina,
    ],
  );
}

export async function contar(filtros: FiltrosListagem): Promise<number> {
  const { clausula, parametros } = montarFiltros(filtros);

  const linhas = await consultar<{ total: string }>(
    `SELECT count(*)::text AS total FROM registros_devolucao r ${clausula}`,
    parametros,
  );

  return Number(linhas[0]?.total ?? 0);
}

export async function buscarPorId(
  id: string,
): Promise<RegistroDevolucaoRegistro | null> {
  const linhas = await consultar<RegistroDevolucaoRegistro>(
    `SELECT ${COLUNAS} ${JUNCOES} WHERE r.id = $1 AND r.excluido_em IS NULL`,
    [id],
  );

  return linhas[0] ?? null;
}

export async function buscarPendentePorMacOuSerial(
  macNormalizado: string,
  serialNormalizado: string,
  ignorarId: string | null = null,
): Promise<{ id: string } | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT r.id
       FROM registros_devolucao r
      WHERE r.excluido_em IS NULL
        AND r.status = 'PENDENTE'
        AND ($3::uuid IS NULL OR r.id <> $3::uuid)
        AND (${MAC_NORMALIZADO} = $1 OR ${SERIAL_NORMALIZADO} = $2)
      LIMIT 1`,
    [macNormalizado, serialNormalizado, ignorarId],
  );

  return linhas[0] ?? null;
}

export async function inserir(
  dados: DadosRegistro,
): Promise<RegistroDevolucaoRegistro> {
  const linhas = await consultar<{ id: string }>(
    `INSERT INTO registros_devolucao (
       data_retirada, data_devolucao,
       funcionario_ixc_id, funcionario_nome_snapshot,
       base_ixc_id, base_nome_snapshot, classe_nome_snapshot,
       auditor_usuario_id,
       cliente_ixc_id, cliente_codigo_snapshot, cliente_nome_snapshot,
       modelo_ixc_id, modelo_nome_snapshot,
       mac, serial_number,
       motivo_id, paradeiro_id,
       recebimento, status, observacao, conciliado_ixc,
       criado_por_usuario_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18::situacao_recebimento, $19::status_devolucao, $20, $21, $22
     )
     RETURNING id`,
    [
      dados.dataRetirada,
      dados.dataDevolucao,
      dados.funcionarioIxcId,
      dados.funcionarioNomeSnapshot,
      dados.baseIxcId,
      dados.baseNomeSnapshot,
      dados.classeNomeSnapshot,
      dados.auditorUsuarioId,
      dados.clienteIxcId,
      dados.clienteCodigoSnapshot,
      dados.clienteNomeSnapshot,
      dados.modeloIxcId,
      dados.modeloNomeSnapshot,
      dados.mac,
      dados.serialNumber,
      dados.motivoId,
      dados.paradeiroId,
      dados.recebimento,
      dados.status,
      dados.observacao,
      dados.conciliadoIxc,
      dados.criadoPorUsuarioId,
    ],
  );

  const criado = await buscarPorId(linhas[0]!.id);

  if (criado === null) {
    throw new Error("Falha ao reler o registro de devolucao recem-criado");
  }

  return criado;
}

export async function atualizar(
  id: string,
  dados: DadosRegistro,
): Promise<RegistroDevolucaoRegistro | null> {
  const linhas = await consultar<{ id: string }>(
    `UPDATE registros_devolucao SET
       data_retirada = $2,
       data_devolucao = $3,
       funcionario_ixc_id = $4,
       funcionario_nome_snapshot = $5,
       base_ixc_id = $6,
       base_nome_snapshot = $7,
       classe_nome_snapshot = $8,
       auditor_usuario_id = $9,
       cliente_ixc_id = $10,
       cliente_codigo_snapshot = $11,
       cliente_nome_snapshot = $12,
       modelo_ixc_id = $13,
       modelo_nome_snapshot = $14,
       mac = $15,
       serial_number = $16,
       motivo_id = $17,
       paradeiro_id = $18,
       recebimento = $19::situacao_recebimento,
       status = $20::status_devolucao,
       observacao = $21,
       conciliado_ixc = $22
     WHERE id = $1 AND excluido_em IS NULL
     RETURNING id`,
    [
      id,
      dados.dataRetirada,
      dados.dataDevolucao,
      dados.funcionarioIxcId,
      dados.funcionarioNomeSnapshot,
      dados.baseIxcId,
      dados.baseNomeSnapshot,
      dados.classeNomeSnapshot,
      dados.auditorUsuarioId,
      dados.clienteIxcId,
      dados.clienteCodigoSnapshot,
      dados.clienteNomeSnapshot,
      dados.modeloIxcId,
      dados.modeloNomeSnapshot,
      dados.mac,
      dados.serialNumber,
      dados.motivoId,
      dados.paradeiroId,
      dados.recebimento,
      dados.status,
      dados.observacao,
      dados.conciliadoIxc,
    ],
  );

  if (linhas.length === 0) {
    return null;
  }

  return buscarPorId(id);
}

export async function excluirLogico(
  id: string,
  usuarioId: string,
  motivo: string,
): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    `UPDATE registros_devolucao
        SET excluido_em = now(),
            excluido_por_usuario_id = $2,
            motivo_exclusao = $3
      WHERE id = $1 AND excluido_em IS NULL
      RETURNING id`,
    [id, usuarioId, motivo],
  );

  return linhas.length > 0;
}
