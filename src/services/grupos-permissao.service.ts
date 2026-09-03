import * as gruposRepositoryPadrao from "../repositories/grupos-permissao.repository.ts";
import * as permissoesRepositoryPadrao from "../repositories/permissoes.repository.ts";
import * as auditoriaRepositoryPadrao from "../repositories/auditoria.repository.ts";
import { emTransacao as emTransacaoPadrao } from "../database/pool.ts";
import { ehGrupoMaster } from "../config/master.ts";
import {
  ErroConflito,
  ErroNaoEncontrado,
  ErroProibido,
  ErroRegraNegocio,
  ErroValidacao,
} from "../erros.ts";
import type {
  FiltrosGrupos,
  GrupoRegistro,
} from "../repositories/grupos-permissao.repository.ts";
import type { ContextoAtor } from "./usuarios.service.ts";

export interface GrupoResposta {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  totalUsuarios?: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EntradaGrupo {
  nome: string;
  descricao?: string | undefined;
}

export interface EntradaAtualizacaoGrupo extends EntradaGrupo {
  ativo: boolean;
  atualizadoEm: string;
}

interface DependenciasGrupos {
  gruposRepository: typeof gruposRepositoryPadrao;
  permissoesRepository: typeof permissoesRepositoryPadrao;
  auditoriaRepository: typeof auditoriaRepositoryPadrao;
  emTransacao: typeof emTransacaoPadrao;
}

const PERMISSAO_STATUS = "usuarios.grupos.inativar";

function paraResposta(grupo: GrupoRegistro): GrupoResposta {
  return {
    id: grupo.id,
    nome: grupo.nome,
    descricao: grupo.descricao,
    ativo: grupo.ativo,
    criadoEm: grupo.criadoEm.toISOString(),
    atualizadoEm: grupo.atualizadoEm.toISOString(),
  };
}

/**
 * O grupo master nao e administravel pelo portal. Tratamos como inexistente em
 * vez de 403 para nao confirmar que ele existe.
 */
function recusarSeMaster(grupo: GrupoRegistro): void {
  if (ehGrupoMaster(grupo.nome)) {
    throw new ErroNaoEncontrado("Grupo nao encontrado");
  }
}

export function criarGruposPermissaoService(
  dependencias: Partial<DependenciasGrupos> = {}
) {
  const gruposRepository =
    dependencias.gruposRepository ?? gruposRepositoryPadrao;
  const permissoesRepository =
    dependencias.permissoesRepository ?? permissoesRepositoryPadrao;
  const auditoriaRepository =
    dependencias.auditoriaRepository ?? auditoriaRepositoryPadrao;
  const emTransacao = dependencias.emTransacao ?? emTransacaoPadrao;

  async function listar(filtros: FiltrosGrupos) {
    const { dados, total } = await gruposRepository.listar(filtros);

    return {
      dados: dados.map((grupo) => ({
        ...paraResposta(grupo),
        totalUsuarios: grupo.totalUsuarios,
      })),
      total,
    };
  }

  async function buscarPorId(id: string): Promise<GrupoResposta> {
    const grupo = await gruposRepository.buscarPorId(id);

    if (!grupo) {
      throw new ErroNaoEncontrado("Grupo nao encontrado");
    }

    recusarSeMaster(grupo);

    return {
      ...paraResposta(grupo),
      totalUsuarios: await gruposRepository.contarUsuarios(id),
    };
  }

  async function criar(
    entrada: EntradaGrupo,
    ator: ContextoAtor
  ): Promise<GrupoResposta> {
    const nome = entrada.nome.trim();

    if (ehGrupoMaster(nome)) {
      throw new ErroConflito("Ja existe um grupo com este nome", "NOME_EM_USO");
    }

    if (await gruposRepository.nomeJaUsado(nome)) {
      throw new ErroConflito("Ja existe um grupo com este nome", "NOME_EM_USO");
    }

    const grupo = await gruposRepository.criar(nome, entrada.descricao ?? null);

    await auditoriaRepository.registrar({
      usuarioId: ator.usuarioId,
      acao: "CRIAR",
      entidade: "grupos_permissao",
      entidadeId: grupo.id,
      dadosAnteriores: null,
      dadosNovos: { nome: grupo.nome, descricao: grupo.descricao },
      motivo: null,
      ipOrigem: ator.ipOrigem,
    });

    return paraResposta(grupo);
  }

  async function atualizar(
    id: string,
    entrada: EntradaAtualizacaoGrupo,
    ator: ContextoAtor
  ): Promise<GrupoResposta> {
    const atual = await gruposRepository.buscarPorId(id);

    if (!atual) {
      throw new ErroNaoEncontrado("Grupo nao encontrado");
    }

    recusarSeMaster(atual);

    const nome = entrada.nome.trim();

    if (await gruposRepository.nomeJaUsado(nome, id)) {
      throw new ErroConflito("Ja existe um grupo com este nome", "NOME_EM_USO");
    }

    if (
      atual.ativo !== entrada.ativo &&
      !ator.permissoes.includes(PERMISSAO_STATUS)
    ) {
      throw new ErroProibido(
        "Voce nao tem permissao para alterar o estado do grupo",
        "PERMISSAO_NEGADA"
      );
    }

    if (atual.ativo && !entrada.ativo) {
      const totalUsuarios = await gruposRepository.contarUsuarios(id);

      if (totalUsuarios > 0) {
        throw new ErroRegraNegocio(
          `Nao e possivel inativar: o grupo possui ${totalUsuarios} usuario(s) vinculado(s)`,
          "GRUPO_COM_USUARIOS"
        );
      }
    }

    const atualizado = await gruposRepository.atualizar(
      id,
      nome,
      entrada.descricao ?? null,
      entrada.ativo,
      new Date(entrada.atualizadoEm)
    );

    if (!atualizado) {
      throw new ErroConflito(
        "O grupo foi alterado por outra pessoa. Recarregue e tente novamente",
        "REGISTRO_DESATUALIZADO"
      );
    }

    await auditoriaRepository.registrar({
      usuarioId: ator.usuarioId,
      acao: "ATUALIZAR",
      entidade: "grupos_permissao",
      entidadeId: id,
      dadosAnteriores: {
        nome: atual.nome,
        descricao: atual.descricao,
        ativo: atual.ativo,
      },
      dadosNovos: {
        nome: atualizado.nome,
        descricao: atualizado.descricao,
        ativo: atualizado.ativo,
      },
      motivo: null,
      ipOrigem: ator.ipOrigem,
    });

    return paraResposta(atualizado);
  }

  async function inativar(
    id: string,
    motivo: string | null,
    ator: ContextoAtor
  ): Promise<void> {
    const atual = await gruposRepository.buscarPorId(id);

    if (!atual) {
      throw new ErroNaoEncontrado("Grupo nao encontrado");
    }

    recusarSeMaster(atual);

    const totalUsuarios = await gruposRepository.contarUsuarios(id);

    if (totalUsuarios > 0) {
      throw new ErroRegraNegocio(
        `Nao e possivel inativar: o grupo possui ${totalUsuarios} usuario(s) vinculado(s)`,
        "GRUPO_COM_USUARIOS"
      );
    }

    if (!atual.ativo) {
      return;
    }

    await gruposRepository.inativar(id);

    await auditoriaRepository.registrar({
      usuarioId: ator.usuarioId,
      acao: "INATIVAR",
      entidade: "grupos_permissao",
      entidadeId: id,
      dadosAnteriores: { ativo: true },
      dadosNovos: { ativo: false },
      motivo,
      ipOrigem: ator.ipOrigem,
    });
  }

  async function listarPermissoes(id: string): Promise<string[]> {
    const grupo = await gruposRepository.buscarPorId(id);

    if (!grupo) {
      throw new ErroNaoEncontrado("Grupo nao encontrado");
    }

    recusarSeMaster(grupo);

    return gruposRepository.buscarPermissoes(id);
  }

  async function substituirPermissoes(
    id: string,
    permissaoIds: string[],
    ator: ContextoAtor
  ): Promise<string[]> {
    const grupo = await gruposRepository.buscarPorId(id);

    if (!grupo) {
      throw new ErroNaoEncontrado("Grupo nao encontrado");
    }

    recusarSeMaster(grupo);

    const unicas = [...new Set(permissaoIds)];
    const inexistentes = await permissoesRepository.listarIdsInexistentes(
      unicas
    );

    if (inexistentes.length > 0) {
      throw new ErroValidacao({
        permissaoIds: inexistentes.map(
          (permissaoId) => `Permissao ${permissaoId} nao existe no catalogo`
        ),
      });
    }

    const anteriores = await gruposRepository.buscarPermissoes(id);

    await emTransacao(async (cliente) => {
      await gruposRepository.substituirPermissoes(id, unicas, cliente);

      await auditoriaRepository.registrar(
        {
          usuarioId: ator.usuarioId,
          acao: "SUBSTITUIR_PERMISSOES",
          entidade: "grupos_permissao",
          entidadeId: id,
          dadosAnteriores: { permissaoIds: anteriores },
          dadosNovos: { permissaoIds: unicas },
          motivo: null,
          ipOrigem: ator.ipOrigem,
        },
        cliente
      );
    });

    return gruposRepository.buscarPermissoes(id);
  }

  return {
    listar,
    buscarPorId,
    criar,
    atualizar,
    inativar,
    listarPermissoes,
    substituirPermissoes,
  };
}

export const gruposPermissaoService = criarGruposPermissaoService();
