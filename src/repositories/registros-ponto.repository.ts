import { consultar, consultarUm } from "../database/pool.ts";

export const STATUS_PONTO = [
  "NO_HORARIO",
  "ATRASO",
  "FALTA",
  "JUSTIFICADO",
] as const;

export type StatusPonto = (typeof STATUS_PONTO)[number];

export interface RegistroPonto {
  id: string;
  usuarioId: string;
  colaborador: string;
  cargo: string | null;
  escala: string | null;
  entradaPrevista: string | null;
  data: string;
  entrada: string | null;
  entradaAlmoco: string | null;
  saidaAlmoco: string | null;
  saida: string | null;
  atrasoMinutos: number;
  status: StatusPonto;
  justificativa: string | null;
}

export interface FiltrosPonto {
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
  usuarioId?: string | undefined;
  status?: StatusPonto | undefined;
}

export interface DadosPonto {
  usuarioId: string;
  data: string;
  entrada: string | null;
  entradaAlmoco: string | null;
  saidaAlmoco: string | null;
  saida: string | null;
  atrasoMinutos: number;
  status: StatusPonto;
  justificativa: string | null;
  criadoPorUsuarioId: string | null;
}

const COLUNAS = `
  r.id,
  r.usuario_id AS "usuarioId",
  u.nome_exibicao AS colaborador,
  c.nome AS cargo,
  u.escala::text AS escala,
  to_char(u.entrada_expediente, 'HH24:MI') AS "entradaPrevista",
  to_char(r.data, 'YYYY-MM-DD') AS data,
  to_char(r.entrada, 'HH24:MI') AS entrada,
  to_char(r.entrada_almoco, 'HH24:MI') AS "entradaAlmoco",
  to_char(r.saida_almoco, 'HH24:MI') AS "saidaAlmoco",
  to_char(r.saida, 'HH24:MI') AS saida,
  r.atraso_minutos AS "atrasoMinutos",
  r.status::text AS status,
  r.justificativa
`;

const FONTE = `
  FROM registros_ponto r
  JOIN usuarios u ON u.id = r.usuario_id
  LEFT JOIN cargos c ON c.id = u.cargo_id
`;

export function listar(filtros: FiltrosPonto): Promise<RegistroPonto[]> {
  return consultar<RegistroPonto>(
    `SELECT ${COLUNAS} ${FONTE}
      WHERE ($1::date IS NULL OR r.data >= $1::date)
        AND ($2::date IS NULL OR r.data <= $2::date)
        AND ($3::uuid IS NULL OR r.usuario_id = $3::uuid)
        AND ($4::text IS NULL OR r.status::text = $4::text)
      ORDER BY r.data DESC, u.nome_exibicao`,
    [
      filtros.dataInicio ?? null,
      filtros.dataFim ?? null,
      filtros.usuarioId ?? null,
      filtros.status ?? null,
    ],
  );
}

export function buscar(id: string): Promise<RegistroPonto | null> {
  return consultarUm<RegistroPonto>(
    `SELECT ${COLUNAS} ${FONTE} WHERE r.id = $1`,
    [id],
  );
}

export function buscarPorUsuarioEData(
  usuarioId: string,
  data: string,
  ignorarId: string | null = null,
): Promise<RegistroPonto | null> {
  return consultarUm<RegistroPonto>(
    `SELECT ${COLUNAS} ${FONTE}
      WHERE r.usuario_id = $1
        AND r.data = $2::date
        AND ($3::uuid IS NULL OR r.id <> $3::uuid)`,
    [usuarioId, data, ignorarId],
  );
}

export async function criar(dados: DadosPonto): Promise<RegistroPonto | null> {
  const linha = await consultarUm<{ id: string }>(
    `INSERT INTO registros_ponto
       (usuario_id, data, entrada, entrada_almoco, saida_almoco, saida,
        atraso_minutos, status, justificativa, criado_por_usuario_id)
     VALUES ($1, $2::date, $3::time, $4::time, $5::time, $6::time,
             $7, $8::status_ponto, $9, $10)
     RETURNING id`,
    [
      dados.usuarioId,
      dados.data,
      dados.entrada,
      dados.entradaAlmoco,
      dados.saidaAlmoco,
      dados.saida,
      dados.atrasoMinutos,
      dados.status,
      dados.justificativa,
      dados.criadoPorUsuarioId,
    ],
  );

  return linha === null ? null : buscar(linha.id);
}

export async function atualizar(
  id: string,
  dados: Omit<DadosPonto, "criadoPorUsuarioId">,
): Promise<RegistroPonto | null> {
  const linha = await consultarUm<{ id: string }>(
    `UPDATE registros_ponto
        SET usuario_id = $2,
            data = $3::date,
            entrada = $4::time,
            entrada_almoco = $5::time,
            saida_almoco = $6::time,
            saida = $7::time,
            atraso_minutos = $8,
            status = $9::status_ponto,
            justificativa = $10,
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    [
      id,
      dados.usuarioId,
      dados.data,
      dados.entrada,
      dados.entradaAlmoco,
      dados.saidaAlmoco,
      dados.saida,
      dados.atrasoMinutos,
      dados.status,
      dados.justificativa,
    ],
  );

  return linha === null ? null : buscar(linha.id);
}

export async function remover(id: string): Promise<boolean> {
  const linha = await consultarUm<{ id: string }>(
    `DELETE FROM registros_ponto WHERE id = $1 RETURNING id`,
    [id],
  );

  return linha !== null;
}

export function listarColaboradoresComJornada(): Promise<
  {
    usuarioId: string;
    nome: string;
    cargo: string | null;
    escala: string;
    entradaPrevista: string | null;
  }[]
> {
  return consultar(
    `SELECT
       u.id AS "usuarioId",
       u.nome_exibicao AS nome,
       c.nome AS cargo,
       u.escala::text AS escala,
       to_char(u.entrada_expediente, 'HH24:MI') AS "entradaPrevista"
     FROM usuarios u
     LEFT JOIN cargos c ON c.id = u.cargo_id
     WHERE u.ativo = true AND u.status = 'ATIVO'
     ORDER BY u.nome_exibicao`,
  );
}
