import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import * as usuariosRepositoryPadrao from "../repositories/usuarios.repository.ts";
import * as gruposRepositoryPadrao from "../repositories/grupos-permissao.repository.ts";
import * as sessoesRepositoryPadrao from "../repositories/sessoes.repository.ts";
import * as auditoriaRepositoryPadrao from "../repositories/auditoria.repository.ts";
import { emailService as emailServicePadrao } from "./email.service.ts";
import { emTransacao as emTransacaoPadrao } from "../database/pool.ts";
import { ehGrupoMaster, pertenceAoMaster } from "../config/master.ts";
import {
  ErroAplicacao,
  ErroConflito,
  ErroNaoEncontrado,
  ErroRegraNegocio,
  ErroValidacao,
} from "../erros.ts";
import type { EmailService } from "./email.service.ts";
import type {
  EscalaTrabalho,
  FiltrosUsuarios,
  StatusUsuario,
  UsuarioRegistro,
} from "../repositories/usuarios.repository.ts";

export interface UsuarioResposta {
  id: string;
  nomeExibicao: string;
  emailLogin: string;
  cargo: string;
  status: StatusUsuario;
  escala: EscalaTrabalho;
  funcionarioIxcId: string | null;
  funcionarioNomeSnapshot: string | null;
  provedorAuth: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  grupos: { id: string; nome: string }[];
}

/**
 * Resposta da criacao. `senhaTemporaria` so vem quando nao ha SMTP configurado:
 * nesse caso a senha nao tem como chegar ao usuario por e-mail, e some para
 * sempre se nao voltar aqui.
 */
export interface UsuarioCriado extends UsuarioResposta {
  senhaTemporaria?: string;
}

export const CARGO_PADRAO = "Não informado";
export const ESCALA_PADRAO: EscalaTrabalho = "5x2";
export const STATUS_PADRAO: StatusUsuario = "ATIVO";

export interface EntradaCriacaoUsuario {
  nomeExibicao: string;
  emailLogin: string;
  cargo?: string | undefined;
  escala?: EscalaTrabalho | undefined;
  status?: StatusUsuario | undefined;
  provedorAuth: string;
  funcionarioIxcId?: string | undefined;
  funcionarioNomeSnapshot?: string | undefined;
  grupoIds: string[];
}

export interface EntradaAtualizacaoUsuario {
  nomeExibicao: string;
  emailLogin: string;
  cargo?: string | undefined;
  escala?: EscalaTrabalho | undefined;
  funcionarioIxcId?: string | undefined;
  funcionarioNomeSnapshot?: string | undefined;
  grupoIds: string[];
  atualizadoEm: string;
}

export interface ContextoAtor {
  usuarioId: string;
  ipOrigem: string | null;
  permissoes: string[];
}

interface DependenciasUsuarios {
  usuariosRepository: typeof usuariosRepositoryPadrao;
  gruposRepository: typeof gruposRepositoryPadrao;
  sessoesRepository: typeof sessoesRepositoryPadrao;
  auditoriaRepository: typeof auditoriaRepositoryPadrao;
  emailService: EmailService;
  emTransacao: typeof emTransacaoPadrao;
  rodadasBcrypt: number;
}

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function paraResposta(
  usuario: UsuarioRegistro,
  grupos: { id: string; nome: string }[]
): UsuarioResposta {
  return {
    id: usuario.id,
    nomeExibicao: usuario.nomeExibicao,
    emailLogin: usuario.emailLogin,
    cargo: usuario.cargo,
    status: usuario.status,
    escala: usuario.escala,
    funcionarioIxcId: usuario.funcionarioIxcId,
    funcionarioNomeSnapshot: usuario.funcionarioNomeSnapshot,
    provedorAuth: usuario.provedorAuth,
    ativo: usuario.ativo,
    deveTrocarSenha: usuario.deveTrocarSenha,
    ultimoAcessoEm: usuario.ultimoAcessoEm?.toISOString() ?? null,
    criadoEm: usuario.criadoEm.toISOString(),
    atualizadoEm: usuario.atualizadoEm.toISOString(),
    grupos,
  };
}

export function criarUsuariosService(
  dependencias: Partial<DependenciasUsuarios> = {}
) {
  const usuariosRepository =
    dependencias.usuariosRepository ?? usuariosRepositoryPadrao;
  const gruposRepository =
    dependencias.gruposRepository ?? gruposRepositoryPadrao;
  const sessoesRepository =
    dependencias.sessoesRepository ?? sessoesRepositoryPadrao;
  const auditoriaRepository =
    dependencias.auditoriaRepository ?? auditoriaRepositoryPadrao;
  const emailService = dependencias.emailService ?? emailServicePadrao;
  const emTransacao = dependencias.emTransacao ?? emTransacaoPadrao;
  const rodadasBcrypt =
    dependencias.rodadasBcrypt ?? Number(process.env.BCRYPT_ROUNDS ?? 10);

  async function validarGrupos(grupoIds: string[]): Promise<void> {
    for (const grupoId of grupoIds) {
      const grupo = await gruposRepository.buscarPorId(grupoId);

      if (!grupo) {
        throw new ErroValidacao({
          grupoIds: [`Grupo ${grupoId} nao encontrado`],
        });
      }

      if (!grupo.ativo) {
        throw new ErroRegraNegocio(
          `O grupo ${grupo.nome} esta inativo e nao pode ser atribuido`,
          "GRUPO_INATIVO"
        );
      }
    }
  }

  function validarVinculoIxc(
    funcionarioIxcId: string | undefined,
    funcionarioNomeSnapshot: string | undefined
  ): void {
    const temId = Boolean(funcionarioIxcId);
    const temNome = Boolean(funcionarioNomeSnapshot);

    if (temId !== temNome) {
      throw new ErroValidacao({
        funcionarioIxcId: [
          "funcionarioIxcId e funcionarioNomeSnapshot devem ser informados juntos",
        ],
      });
    }
  }

  async function listar(filtros: FiltrosUsuarios) {
    const { dados, total } = await usuariosRepository.listar(filtros);
    const grupos = await usuariosRepository.buscarGruposDeVarios(
      dados.map((usuario) => usuario.id)
    );

    return {
      dados: dados.map((usuario) =>
        paraResposta(
          usuario,
          (grupos.get(usuario.id) ?? []).map((grupo) => ({
            id: grupo.id,
            nome: grupo.nome,
          }))
        )
      ),
      total,
    };
  }

  async function buscarPorId(id: string): Promise<UsuarioResposta> {
    const usuario = await usuariosRepository.buscarPorId(id);

    if (!usuario) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }

    const grupos = await usuariosRepository.buscarGrupos(id);

    // O master nao existe para a administracao do portal, nem por id.
    if (pertenceAoMaster(grupos)) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }

    return paraResposta(
      usuario,
      grupos.map((grupo) => ({ id: grupo.id, nome: grupo.nome }))
    );
  }

  /** Recusa operar sobre a conta master pelas rotas de administracao. */
  async function recusarMaster(id: string): Promise<void> {
    if (pertenceAoMaster(await usuariosRepository.buscarGrupos(id))) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }
  }

  /** Impede que o grupo master seja atribuido a alguem pelo portal. */
  async function recusarGrupoMaster(grupoIds: string[]): Promise<void> {
    for (const grupoId of grupoIds) {
      const grupo = await gruposRepository.buscarPorId(grupoId);

      if (grupo && ehGrupoMaster(grupo.nome)) {
        throw new ErroValidacao({
          grupoIds: [`Grupo ${grupoId} nao encontrado`],
        });
      }
    }
  }

  async function criar(
    entrada: EntradaCriacaoUsuario,
    ator: ContextoAtor
  ): Promise<UsuarioCriado> {
    const emailLogin = normalizarEmail(entrada.emailLogin);

    validarVinculoIxc(entrada.funcionarioIxcId, entrada.funcionarioNomeSnapshot);

    if (await usuariosRepository.emailJaUsado(emailLogin)) {
      throw new ErroConflito(
        "Ja existe um usuario com este e-mail",
        "EMAIL_EM_USO"
      );
    }

    if (
      entrada.funcionarioIxcId &&
      (await usuariosRepository.funcionarioJaVinculado(entrada.funcionarioIxcId))
    ) {
      throw new ErroConflito(
        "Este funcionario ja esta vinculado a outro usuario ativo",
        "FUNCIONARIO_JA_VINCULADO"
      );
    }

    await validarGrupos(entrada.grupoIds);
    await recusarGrupoMaster(entrada.grupoIds);

    const senhaTemporaria =
      entrada.provedorAuth === "LOCAL"
        ? randomBytes(12).toString("base64url")
        : null;
    const senhaHash = senhaTemporaria
      ? await bcrypt.hash(senhaTemporaria, rodadasBcrypt)
      : null;

    const criado = await emTransacao(async (cliente) => {
      const usuario = await usuariosRepository.criar(
        {
          nomeExibicao: entrada.nomeExibicao.trim(),
          emailLogin,
          cargo: entrada.cargo?.trim() || CARGO_PADRAO,
          escala: entrada.escala ?? ESCALA_PADRAO,
          status: entrada.status ?? STATUS_PADRAO,
          senhaHash,
          provedorAuth: entrada.provedorAuth,
          funcionarioIxcId: entrada.funcionarioIxcId ?? null,
          funcionarioNomeSnapshot: entrada.funcionarioNomeSnapshot ?? null,
          deveTrocarSenha: entrada.provedorAuth === "LOCAL",
          criadoPorUsuarioId: ator.usuarioId,
        },
        cliente
      );

      await usuariosRepository.substituirGrupos(
        usuario.id,
        entrada.grupoIds,
        cliente
      );

      await auditoriaRepository.registrar(
        {
          usuarioId: ator.usuarioId,
          acao: "CRIAR",
          entidade: "usuarios",
          entidadeId: usuario.id,
          dadosAnteriores: null,
          dadosNovos: {
            nomeExibicao: usuario.nomeExibicao,
            emailLogin: usuario.emailLogin,
            grupoIds: entrada.grupoIds,
          },
          motivo: null,
          ipOrigem: ator.ipOrigem,
        },
        cliente
      );

      return usuario;
    });

    // Sem SMTP configurado nao ha como entregar a senha por e-mail, e ela so
    // existe em memoria: devolver na resposta e a unica forma de nao perde-la.
    let senhaParaDevolver: string | undefined;

    if (senhaTemporaria) {
      if (emailService.configurado()) {
        try {
          await emailService.enviarCredenciaisNovoUsuario({
            nome: criado.nomeExibicao,
            email: criado.emailLogin,
            senhaTemporaria,
          });
        } catch (erro) {
          console.error("Falha ao enviar credenciais do novo usuario", erro);
          throw new ErroAplicacao(
            502,
            "EMAIL_NAO_ENVIADO",
            "Usuario criado, mas nao foi possivel enviar o e-mail de acesso"
          );
        }
      } else {
        senhaParaDevolver = senhaTemporaria;
      }
    }

    const usuario = await buscarPorId(criado.id);

    return senhaParaDevolver === undefined
      ? usuario
      : { ...usuario, senhaTemporaria: senhaParaDevolver };
  }

  async function atualizar(
    id: string,
    entrada: EntradaAtualizacaoUsuario,
    ator: ContextoAtor
  ): Promise<UsuarioResposta> {
    const atual = await usuariosRepository.buscarPorId(id);

    if (!atual) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }

    await recusarMaster(id);

    const emailLogin = normalizarEmail(entrada.emailLogin);

    validarVinculoIxc(entrada.funcionarioIxcId, entrada.funcionarioNomeSnapshot);

    if (await usuariosRepository.emailJaUsado(emailLogin, id)) {
      throw new ErroConflito(
        "Ja existe um usuario com este e-mail",
        "EMAIL_EM_USO"
      );
    }

    if (
      entrada.funcionarioIxcId &&
      (await usuariosRepository.funcionarioJaVinculado(
        entrada.funcionarioIxcId,
        id
      ))
    ) {
      throw new ErroConflito(
        "Este funcionario ja esta vinculado a outro usuario ativo",
        "FUNCIONARIO_JA_VINCULADO"
      );
    }

    await validarGrupos(entrada.grupoIds);
    await recusarGrupoMaster(entrada.grupoIds);

    await emTransacao(async (cliente) => {
      const atualizado = await usuariosRepository.atualizar(
        id,
        {
          nomeExibicao: entrada.nomeExibicao.trim(),
          emailLogin,
          // Omitir cargo/escala preserva o que ja estava gravado, em vez de
          // silenciosamente devolve-los ao valor padrao.
          cargo: entrada.cargo?.trim() || atual.cargo,
          escala: entrada.escala ?? atual.escala,
          funcionarioIxcId: entrada.funcionarioIxcId ?? null,
          funcionarioNomeSnapshot: entrada.funcionarioNomeSnapshot ?? null,
        },
        new Date(entrada.atualizadoEm),
        cliente
      );

      if (!atualizado) {
        throw new ErroConflito(
          "O usuario foi alterado por outra pessoa. Recarregue e tente novamente",
          "REGISTRO_DESATUALIZADO"
        );
      }

      await usuariosRepository.substituirGrupos(id, entrada.grupoIds, cliente);

      await auditoriaRepository.registrar(
        {
          usuarioId: ator.usuarioId,
          acao: "ATUALIZAR",
          entidade: "usuarios",
          entidadeId: id,
          dadosAnteriores: {
            nomeExibicao: atual.nomeExibicao,
            emailLogin: atual.emailLogin,
            funcionarioIxcId: atual.funcionarioIxcId,
          },
          dadosNovos: {
            nomeExibicao: atualizado.nomeExibicao,
            emailLogin: atualizado.emailLogin,
            funcionarioIxcId: atualizado.funcionarioIxcId,
            grupoIds: entrada.grupoIds,
          },
          motivo: null,
          ipOrigem: ator.ipOrigem,
        },
        cliente
      );
    });

    return buscarPorId(id);
  }

  async function alterarStatus(
    id: string,
    ativo: boolean,
    motivo: string | null,
    ator: ContextoAtor
  ): Promise<UsuarioResposta> {
    const atual = await usuariosRepository.buscarPorId(id);

    if (!atual) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }

    await recusarMaster(id);

    if (atual.id === ator.usuarioId && !ativo) {
      throw new ErroRegraNegocio(
        "Nao e possivel bloquear o proprio usuario",
        "AUTO_BLOQUEIO"
      );
    }

    if (atual.ativo === ativo) {
      return buscarPorId(id);
    }

    await usuariosRepository.alterarAtivo(id, ativo);

    if (!ativo) {
      await sessoesRepository.revogarTodasDoUsuario(id, "BLOQUEIO_USUARIO");
    }

    await auditoriaRepository.registrar({
      usuarioId: ator.usuarioId,
      acao: ativo ? "ATIVAR" : "BLOQUEAR",
      entidade: "usuarios",
      entidadeId: id,
      dadosAnteriores: { ativo: atual.ativo },
      dadosNovos: { ativo },
      motivo,
      ipOrigem: ator.ipOrigem,
    });

    return buscarPorId(id);
  }

  async function redefinirSenha(
    id: string,
    ator: ContextoAtor
  ): Promise<{ senhaTemporaria: string }> {
    const usuario = await usuariosRepository.buscarPorId(id);

    if (!usuario) {
      throw new ErroNaoEncontrado("Usuario nao encontrado");
    }

    await recusarMaster(id);

    if (usuario.provedorAuth !== "LOCAL") {
      throw new ErroRegraNegocio(
        "Somente usuarios com provedor LOCAL possuem senha neste sistema",
        "PROVEDOR_SEM_SENHA_LOCAL"
      );
    }

    const senhaTemporaria = randomBytes(9).toString("base64url");
    const senhaHash = await bcrypt.hash(senhaTemporaria, rodadasBcrypt);

    await usuariosRepository.definirSenha(id, senhaHash, true);
    await sessoesRepository.revogarTodasDoUsuario(id, "TROCA_SENHA");

    await auditoriaRepository.registrar({
      usuarioId: ator.usuarioId,
      acao: "REDEFINIR_SENHA",
      entidade: "usuarios",
      entidadeId: id,
      dadosAnteriores: null,
      dadosNovos: null,
      motivo: null,
      ipOrigem: ator.ipOrigem,
    });

    return { senhaTemporaria };
  }

  return {
    listar,
    buscarPorId,
    criar,
    atualizar,
    alterarStatus,
    redefinirSenha,
  };
}

export const usuariosService = criarUsuariosService();
