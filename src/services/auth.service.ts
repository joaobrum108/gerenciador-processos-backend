import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as usuariosRepositoryPadrao from "../repositories/usuarios.repository.ts";
import * as sessoesRepositoryPadrao from "../repositories/sessoes.repository.ts";
import { ErroNaoAutenticado, ErroRegraNegocio } from "../erros.ts";
import type { UsuarioRegistro } from "../repositories/usuarios.repository.ts";

export interface UsuarioAutenticado {
  id: string;
  nomeExibicao: string;
  emailLogin: string;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  deveTrocarSenha: boolean;
  ultimoAcessoEm: Date | null;
  grupos: { id: string; nome: string }[];
  permissoes: string[];
}

export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  expiraEm: string;
  usuario: UsuarioAutenticado;
}

export interface ContextoRequisicao {
  ipOrigem: string | null;
  userAgent: string | null;
}

interface ConfiguracaoAuth {
  segredoJwt: string;
  expiracaoJwt: string;
  diasExpiracaoRefresh: number;
}

interface DependenciasAuth {
  usuariosRepository: typeof usuariosRepositoryPadrao;
  sessoesRepository: typeof sessoesRepositoryPadrao;
  configuracao: ConfiguracaoAuth;
}

/**
 * `database-api.md` §6: usuarios INATIVO ou CONVITE_PENDENTE nao sao autorizados.
 * `ativo` e `status` sao mantidos em sincronia na escrita, mas quem escreve por
 * SQL puro pode divergir os dois, entao o acesso exige os dois concordando.
 */
function podeAcessar(usuario: UsuarioRegistro): boolean {
  return usuario.ativo && usuario.status === "ATIVO";
}

function configuracaoDoAmbiente(): ConfiguracaoAuth {
  const segredoJwt = process.env.JWT_SECRET;

  if (!segredoJwt) {
    throw new Error("JWT_SECRET nao definida no .env");
  }

  return {
    segredoJwt,
    expiracaoJwt: process.env.JWT_EXPIRACAO ?? "15m",
    diasExpiracaoRefresh: Number(process.env.REFRESH_EXPIRACAO_DIAS ?? 7),
  };
}

export function gerarHashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

export function criarAuthService(dependencias: Partial<DependenciasAuth> = {}) {
  const usuariosRepository =
    dependencias.usuariosRepository ?? usuariosRepositoryPadrao;
  const sessoesRepository =
    dependencias.sessoesRepository ?? sessoesRepositoryPadrao;

  let configuracaoCache: ConfiguracaoAuth | null =
    dependencias.configuracao ?? null;

  function configuracao(): ConfiguracaoAuth {
    configuracaoCache = configuracaoCache ?? configuracaoDoAmbiente();
    return configuracaoCache;
  }

  function assinarAccessToken(usuarioId: string): string {
    const { segredoJwt, expiracaoJwt } = configuracao();
    return jwt.sign({ sub: usuarioId }, segredoJwt, {
      expiresIn: expiracaoJwt,
    } as jwt.SignOptions);
  }

  function calcularExpiracaoRefresh(): Date {
    const { diasExpiracaoRefresh } = configuracao();
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + diasExpiracaoRefresh);
    return expiraEm;
  }

  async function montarUsuarioAutenticado(
    usuario: UsuarioRegistro
  ): Promise<UsuarioAutenticado> {
    const [grupos, permissoes] = await Promise.all([
      usuariosRepository.buscarGrupos(usuario.id),
      usuariosRepository.buscarPermissoes(usuario.id),
    ]);

    return {
      id: usuario.id,
      nomeExibicao: usuario.nomeExibicao,
      emailLogin: usuario.emailLogin,
      funcionarioIxcId: usuario.funcionarioIxcId,
      funcionarioNomeSnapshot: usuario.funcionarioNomeSnapshot,
      deveTrocarSenha: usuario.deveTrocarSenha,
      ultimoAcessoEm: usuario.ultimoAcessoEm,
      grupos: grupos
        .filter((grupo) => grupo.ativo)
        .map((grupo) => ({ id: grupo.id, nome: grupo.nome })),
      permissoes,
    };
  }

  async function emitirSessao(
    usuario: UsuarioRegistro,
    contexto: ContextoRequisicao
  ): Promise<ResultadoLogin> {
    const refreshToken = randomBytes(48).toString("base64url");
    const expiraEm = calcularExpiracaoRefresh();

    await sessoesRepository.criar({
      usuarioId: usuario.id,
      refreshTokenHash: gerarHashRefreshToken(refreshToken),
      expiraEm,
      ipOrigem: contexto.ipOrigem,
      userAgent: contexto.userAgent,
    });

    return {
      accessToken: assinarAccessToken(usuario.id),
      refreshToken,
      expiraEm: expiraEm.toISOString(),
      usuario: await montarUsuarioAutenticado(usuario),
    };
  }

  async function login(
    emailLogin: string,
    senha: string,
    contexto: ContextoRequisicao
  ): Promise<ResultadoLogin> {
    const usuario = await usuariosRepository.buscarPorEmailLogin(
      emailLogin.trim().toLowerCase()
    );

    if (!usuario || usuario.provedorAuth !== "LOCAL" || !usuario.senhaHash) {
      throw new ErroNaoAutenticado("E-mail ou senha invalidos");
    }

    const senhaConfere = await bcrypt.compare(senha, usuario.senhaHash);

    if (!senhaConfere) {
      throw new ErroNaoAutenticado("E-mail ou senha invalidos");
    }

    if (!podeAcessar(usuario)) {
      throw new ErroNaoAutenticado(
        "Usuario inativo",
        "USUARIO_INATIVO"
      );
    }

    const resultado = await emitirSessao(usuario, contexto);
    await usuariosRepository.registrarAcesso(usuario.id);

    return resultado;
  }

  async function renovar(
    refreshToken: string,
    contexto: ContextoRequisicao
  ): Promise<ResultadoLogin> {
    const sessao = await sessoesRepository.buscarPorHash(
      gerarHashRefreshToken(refreshToken)
    );

    if (!sessao) {
      throw new ErroNaoAutenticado(
        "Refresh token invalido",
        "REFRESH_INVALIDO"
      );
    }

    if (sessao.revogadoEm) {
      if (sessao.motivoRevogacao === "ROTACAO") {
        await sessoesRepository.revogarTodasDoUsuario(
          sessao.usuarioId,
          "LOGOUT"
        );
      }
      throw new ErroNaoAutenticado(
        "Refresh token invalido",
        "REFRESH_INVALIDO"
      );
    }

    if (sessao.expiraEm.getTime() <= Date.now()) {
      throw new ErroNaoAutenticado(
        "Refresh token expirado",
        "REFRESH_EXPIRADO"
      );
    }

    const usuario = await usuariosRepository.buscarPorId(sessao.usuarioId);

    if (!usuario || !podeAcessar(usuario)) {
      await sessoesRepository.revogar(sessao.id, "BLOQUEIO_USUARIO");
      throw new ErroNaoAutenticado("Usuario inativo", "USUARIO_INATIVO");
    }

    const novoRefreshToken = randomBytes(48).toString("base64url");
    const expiraEm = calcularExpiracaoRefresh();

    const novaSessao = await sessoesRepository.criar({
      usuarioId: usuario.id,
      refreshTokenHash: gerarHashRefreshToken(novoRefreshToken),
      expiraEm,
      ipOrigem: contexto.ipOrigem,
      userAgent: contexto.userAgent,
    });

    await sessoesRepository.revogar(sessao.id, "ROTACAO", novaSessao.id);
    await sessoesRepository.registrarUso(novaSessao.id);

    return {
      accessToken: assinarAccessToken(usuario.id),
      refreshToken: novoRefreshToken,
      expiraEm: expiraEm.toISOString(),
      usuario: await montarUsuarioAutenticado(usuario),
    };
  }

  async function sair(refreshToken: string): Promise<void> {
    const sessao = await sessoesRepository.buscarPorHash(
      gerarHashRefreshToken(refreshToken)
    );

    if (sessao && !sessao.revogadoEm) {
      await sessoesRepository.revogar(sessao.id, "LOGOUT");
    }
  }

  async function resolverUsuarioDoAccessToken(
    accessToken: string
  ): Promise<UsuarioAutenticado> {
    const { segredoJwt } = configuracao();
    let usuarioId: string;

    try {
      const conteudo = jwt.verify(accessToken, segredoJwt);

      if (typeof conteudo === "string" || !conteudo.sub) {
        throw new ErroNaoAutenticado("Token invalido", "TOKEN_INVALIDO");
      }

      usuarioId = String(conteudo.sub);
    } catch (erro) {
      if (erro instanceof ErroNaoAutenticado) {
        throw erro;
      }
      if (erro instanceof jwt.TokenExpiredError) {
        throw new ErroNaoAutenticado("Token expirado", "TOKEN_EXPIRADO");
      }
      throw new ErroNaoAutenticado("Token invalido", "TOKEN_INVALIDO");
    }

    const usuario = await usuariosRepository.buscarPorId(usuarioId);

    if (!usuario || !podeAcessar(usuario)) {
      throw new ErroNaoAutenticado("Usuario inativo", "USUARIO_INATIVO");
    }

    return montarUsuarioAutenticado(usuario);
  }

  /**
   * Troca de senha pelo proprio usuario. Exige a senha atual — diferente de
   * `usuarios.redefinirSenha`, que e administrativa e sorteia uma senha.
   *
   * Ao final revoga todas as sessoes: quem trocou a senha precisa entrar de
   * novo, e qualquer sessao aberta em outro dispositivo cai junto.
   */
  async function trocarSenha(
    usuarioId: string,
    senhaAtual: string,
    senhaNova: string
  ): Promise<void> {
    const usuario = await usuariosRepository.buscarComSenhaPorId(usuarioId);

    if (!usuario || !podeAcessar(usuario)) {
      throw new ErroNaoAutenticado("Usuario inativo", "USUARIO_INATIVO");
    }

    if (usuario.provedorAuth !== "LOCAL" || !usuario.senhaHash) {
      throw new ErroRegraNegocio(
        "Somente usuarios com provedor LOCAL possuem senha neste sistema",
        "PROVEDOR_SEM_SENHA_LOCAL"
      );
    }

    if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
      throw new ErroNaoAutenticado("Senha atual incorreta", "SENHA_INCORRETA");
    }

    if (await bcrypt.compare(senhaNova, usuario.senhaHash)) {
      throw new ErroRegraNegocio(
        "A nova senha deve ser diferente da atual",
        "SENHA_REPETIDA"
      );
    }

    const rodadas = Number(process.env.BCRYPT_ROUNDS ?? 10);
    const senhaHash = await bcrypt.hash(senhaNova, rodadas);

    await usuariosRepository.definirSenha(usuarioId, senhaHash, false);
    await sessoesRepository.revogarTodasDoUsuario(usuarioId, "TROCA_SENHA");
  }

  async function usuarioAutenticado(
    usuarioId: string
  ): Promise<UsuarioAutenticado> {
    const usuario = await usuariosRepository.buscarPorId(usuarioId);

    if (!usuario) {
      throw new ErroNaoAutenticado("Usuario inativo", "USUARIO_INATIVO");
    }

    return montarUsuarioAutenticado(usuario);
  }

  return {
    login,
    renovar,
    sair,
    trocarSenha,
    resolverUsuarioDoAccessToken,
    usuarioAutenticado,
  };
}

export const authService = criarAuthService();
