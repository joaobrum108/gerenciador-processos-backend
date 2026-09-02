import { consultar, consultarUm, pool } from "../database/pool.ts";
import type { PoolClient } from "pg";

export interface UsuarioRegistro {
  id: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  nomeExibicao: string;
  emailLogin: string;
  provedorAuth: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoAcessoEm: Date | null;
  senhaAlteradaEm: Date | null;
  criadoPorUsuarioId: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface UsuarioComSenha extends UsuarioRegistro {
  senhaHash: string | null;
}

export interface GrupoDoUsuario {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface FiltrosUsuarios {
  busca: string | null;
  ativo: boolean | null;
  grupoId: string | null;
  pagina: number;
  porPagina: number;
  ordenarPor: string;
  ordem: string;
}

export interface DadosCriacaoUsuario {
  nomeExibicao: string;
  emailLogin: string;
  senhaHash: string | null;
  provedorAuth: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  deveTrocarSenha: boolean;
  criadoPorUsuarioId: string | null;
}

export interface DadosAtualizacaoUsuario {
  nomeExibicao: string;
  emailLogin: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
}

const COLUNAS = `
  id,
  funcionario_ixc_id AS "funcionarioIxcId",
  funcionario_nome_snapshot AS "funcionarioNomeSnapshot",
  nome_exibicao AS "nomeExibicao",
  email_login AS "emailLogin",
  provedor_auth AS "provedorAuth",
  ativo,
  deve_trocar_senha AS "deveTrocarSenha",
  ultimo_acesso_em AS "ultimoAcessoEm",
  senha_alterada_em AS "senhaAlteradaEm",
  criado_por_usuario_id AS "criadoPorUsuarioId",
  criado_em AS "criadoEm",
  atualizado_em AS "atualizadoEm"
`;

const CONDICOES_LISTAGEM = `
  WHERE ($1::text IS NULL OR u.nome_exibicao ILIKE '%' || $1::text || '%' OR u.email_login ILIKE '%' || $1::text || '%')
    AND ($2::boolean IS NULL OR u.ativo = $2::boolean)
    AND ($3::uuid IS NULL OR EXISTS (
          SELECT 1 FROM usuario_grupos ug
           WHERE ug.usuario_id = u.id AND ug.grupo_id = $3::uuid))
`;

const COLUNAS_ORDENACAO: Record<string, string> = {
  nomeExibicao: "nome_exibicao",
  emailLogin: "email_login",
  criadoEm: "criado_em",
  ultimoAcessoEm: "ultimo_acesso_em",
  ativo: "ativo",
};

export const ORDENACOES_PERMITIDAS = Object.keys(COLUNAS_ORDENACAO);

export async function buscarPorEmailLogin(
  emailLogin: string
): Promise<UsuarioComSenha | null> {
  return consultarUm<UsuarioComSenha>(
    `SELECT ${COLUNAS}, senha_hash AS "senhaHash" FROM usuarios WHERE email_login = $1`,
    [emailLogin]
  );
}

export async function buscarPorId(id: string): Promise<UsuarioRegistro | null> {
  return consultarUm<UsuarioRegistro>(
    `SELECT ${COLUNAS} FROM usuarios WHERE id = $1`,
    [id]
  );
}

export async function buscarComSenhaPorId(
  id: string
): Promise<UsuarioComSenha | null> {
  return consultarUm<UsuarioComSenha>(
    `SELECT ${COLUNAS}, senha_hash AS "senhaHash" FROM usuarios WHERE id = $1`,
    [id]
  );
}

export async function emailJaUsado(
  emailLogin: string,
  ignorarUsuarioId: string | null = null
): Promise<boolean> {
  const linha = await consultarUm<{ existe: boolean }>(
    `SELECT true AS existe
       FROM usuarios
      WHERE email_login = $1
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [emailLogin, ignorarUsuarioId]
  );
  return linha !== null;
}

export async function funcionarioJaVinculado(
  funcionarioIxcId: string,
  ignorarUsuarioId: string | null = null
): Promise<boolean> {
  const linha = await consultarUm<{ existe: boolean }>(
    `SELECT true AS existe
       FROM usuarios
      WHERE funcionario_ixc_id = $1
        AND ativo = true
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [funcionarioIxcId, ignorarUsuarioId]
  );
  return linha !== null;
}

export async function listar(
  filtros: FiltrosUsuarios
): Promise<{ dados: UsuarioRegistro[]; total: number }> {
  const coluna = COLUNAS_ORDENACAO[filtros.ordenarPor] ?? "nome_exibicao";
  const direcao = filtros.ordem === "asc" ? "ASC" : "DESC";
  const deslocamento = (filtros.pagina - 1) * filtros.porPagina;

  const dados = await consultar<UsuarioRegistro>(
    `SELECT
       u.id,
       u.funcionario_ixc_id AS "funcionarioIxcId",
       u.funcionario_nome_snapshot AS "funcionarioNomeSnapshot",
       u.nome_exibicao AS "nomeExibicao",
       u.email_login AS "emailLogin",
       u.provedor_auth AS "provedorAuth",
       u.ativo,
       u.deve_trocar_senha AS "deveTrocarSenha",
       u.ultimo_acesso_em AS "ultimoAcessoEm",
       u.senha_alterada_em AS "senhaAlteradaEm",
       u.criado_por_usuario_id AS "criadoPorUsuarioId",
       u.criado_em AS "criadoEm",
       u.atualizado_em AS "atualizadoEm"
     FROM usuarios u
     ${CONDICOES_LISTAGEM}
     ORDER BY u.${coluna} ${direcao}
     LIMIT $4 OFFSET $5`,
    [
      filtros.busca,
      filtros.ativo,
      filtros.grupoId,
      filtros.porPagina,
      deslocamento,
    ]
  );

  const totalizador = await consultarUm<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM usuarios u ${CONDICOES_LISTAGEM}`,
    [filtros.busca, filtros.ativo, filtros.grupoId]
  );

  return { dados, total: Number(totalizador?.total ?? 0) };
}

export async function buscarGrupos(
  usuarioId: string
): Promise<GrupoDoUsuario[]> {
  return consultar<GrupoDoUsuario>(
    `SELECT g.id, g.nome, g.ativo
       FROM usuario_grupos ug
       JOIN grupos_permissao g ON g.id = ug.grupo_id
      WHERE ug.usuario_id = $1
      ORDER BY g.nome ASC`,
    [usuarioId]
  );
}

export async function buscarGruposDeVarios(
  usuarioIds: string[]
): Promise<Map<string, GrupoDoUsuario[]>> {
  const mapa = new Map<string, GrupoDoUsuario[]>();

  if (usuarioIds.length === 0) {
    return mapa;
  }

  const linhas = await consultar<GrupoDoUsuario & { usuarioId: string }>(
    `SELECT ug.usuario_id AS "usuarioId", g.id, g.nome, g.ativo
       FROM usuario_grupos ug
       JOIN grupos_permissao g ON g.id = ug.grupo_id
      WHERE ug.usuario_id = ANY($1::uuid[])
      ORDER BY g.nome ASC`,
    [usuarioIds]
  );

  for (const linha of linhas) {
    const atuais = mapa.get(linha.usuarioId) ?? [];
    atuais.push({ id: linha.id, nome: linha.nome, ativo: linha.ativo });
    mapa.set(linha.usuarioId, atuais);
  }

  return mapa;
}

export async function buscarPermissoes(usuarioId: string): Promise<string[]> {
  const linhas = await consultar<{ permissaoId: string }>(
    `SELECT DISTINCT gp.permissao_id AS "permissaoId"
       FROM usuario_grupos ug
       JOIN grupos_permissao g ON g.id = ug.grupo_id AND g.ativo = true
       JOIN grupo_permissoes gp ON gp.grupo_id = g.id
      WHERE ug.usuario_id = $1
      ORDER BY gp.permissao_id ASC`,
    [usuarioId]
  );
  return linhas.map((linha) => linha.permissaoId);
}

export async function criar(
  dados: DadosCriacaoUsuario,
  cliente: PoolClient | null = null
): Promise<UsuarioRegistro> {
  const executor = cliente ?? pool;
  const { rows } = await executor.query<UsuarioRegistro>(
    `INSERT INTO usuarios (
       id, funcionario_ixc_id, funcionario_nome_snapshot, nome_exibicao,
       email_login, senha_hash, provedor_auth, ativo, deve_trocar_senha,
       senha_alterada_em, criado_por_usuario_id, criado_em, atualizado_em
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, $7,
       CASE WHEN $5::varchar IS NULL THEN NULL ELSE now() END, $8, now(), now()
     )
     RETURNING ${COLUNAS}`,
    [
      dados.funcionarioIxcId,
      dados.funcionarioNomeSnapshot,
      dados.nomeExibicao,
      dados.emailLogin,
      dados.senhaHash,
      dados.provedorAuth,
      dados.deveTrocarSenha,
      dados.criadoPorUsuarioId,
    ]
  );

  const criado = rows[0];
  if (!criado) {
    throw new Error("Falha ao inserir usuario");
  }
  return criado;
}

export async function atualizar(
  id: string,
  dados: DadosAtualizacaoUsuario,
  atualizadoEmAnterior: Date,
  cliente: PoolClient | null = null
): Promise<UsuarioRegistro | null> {
  const executor = cliente ?? pool;
  const { rows } = await executor.query<UsuarioRegistro>(
    `UPDATE usuarios
        SET nome_exibicao = $2,
            email_login = $3,
            funcionario_ixc_id = $4,
            funcionario_nome_snapshot = $5,
            atualizado_em = now()
      WHERE id = $1
        AND atualizado_em = $6
      RETURNING ${COLUNAS}`,
    [
      id,
      dados.nomeExibicao,
      dados.emailLogin,
      dados.funcionarioIxcId,
      dados.funcionarioNomeSnapshot,
      atualizadoEmAnterior,
    ]
  );
  return rows[0] ?? null;
}

export async function alterarAtivo(
  id: string,
  ativo: boolean,
  cliente: PoolClient | null = null
): Promise<UsuarioRegistro | null> {
  const executor = cliente ?? pool;
  const { rows } = await executor.query<UsuarioRegistro>(
    `UPDATE usuarios
        SET ativo = $2, atualizado_em = now()
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [id, ativo]
  );
  return rows[0] ?? null;
}

export async function definirSenha(
  id: string,
  senhaHash: string,
  deveTrocarSenha: boolean,
  cliente: PoolClient | null = null
): Promise<void> {
  const executor = cliente ?? pool;
  await executor.query(
    `UPDATE usuarios
        SET senha_hash = $2,
            deve_trocar_senha = $3,
            senha_alterada_em = now(),
            atualizado_em = now()
      WHERE id = $1`,
    [id, senhaHash, deveTrocarSenha]
  );
}

export async function registrarAcesso(id: string): Promise<void> {
  await pool.query(`UPDATE usuarios SET ultimo_acesso_em = now() WHERE id = $1`, [
    id,
  ]);
}

export async function substituirGrupos(
  usuarioId: string,
  grupoIds: string[],
  cliente: PoolClient
): Promise<void> {
  await cliente.query(`DELETE FROM usuario_grupos WHERE usuario_id = $1`, [
    usuarioId,
  ]);

  if (grupoIds.length === 0) {
    return;
  }

  await cliente.query(
    `INSERT INTO usuario_grupos (usuario_id, grupo_id, criado_em)
     SELECT $1, grupo_id, now() FROM UNNEST($2::uuid[]) AS grupo_id`,
    [usuarioId, grupoIds]
  );
}
