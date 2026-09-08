import * as cargosRepositorioPadrao from "../repositories/cargos.repository.ts";
import { ErroConflito, ErroNaoEncontrado, ErroRegraNegocio } from "../erros.ts";
import type {
  AlteracaoCargo,
  CargoRegistro,
} from "../repositories/cargos.repository.ts";

interface DependenciasCargos {
  repositorio: typeof cargosRepositorioPadrao;
}

export function criarCargosService(
  dependencias: Partial<DependenciasCargos> = {},
) {
  const repositorio = dependencias.repositorio ?? cargosRepositorioPadrao;

  async function garantirNomeLivre(
    nome: string,
    ignorarId: string | null,
  ): Promise<void> {
    const existente = await repositorio.buscarPorNome(nome, ignorarId);

    if (existente !== null) {
      throw new ErroConflito(
        `Ja existe um cargo com o nome "${existente.nome}"`,
        "NOME_DUPLICADO",
      );
    }
  }

  async function listar(incluirInativos = false): Promise<CargoRegistro[]> {
    return repositorio.listar(incluirInativos);
  }

  async function criar(dados: {
    nome: string;
    nivel: string | null;
    criadoPorUsuarioId: string | null;
  }): Promise<CargoRegistro> {
    const nome = dados.nome.trim();

    await garantirNomeLivre(nome, null);

    const criado = await repositorio.criar({ ...dados, nome });

    if (criado === null) {
      throw new ErroRegraNegocio("Nao foi possivel criar o cargo");
    }

    return criado;
  }

  async function atualizar(
    id: string,
    alteracao: AlteracaoCargo,
  ): Promise<CargoRegistro> {
    const atual = await repositorio.buscar(id);

    if (atual === null) {
      throw new ErroNaoEncontrado("Cargo nao encontrado");
    }

    const normalizada: AlteracaoCargo = {
      ...alteracao,
      ...(alteracao.nome === undefined ? {} : { nome: alteracao.nome.trim() }),
    };

    if (normalizada.nome !== undefined) {
      await garantirNomeLivre(normalizada.nome, id);
    }

    if (normalizada.ativo === false && atual.ativo) {
      const vinculados = await repositorio.contarUsuarios(id);

      if (vinculados > 0) {
        throw new ErroConflito(
          `Este cargo esta em uso por ${vinculados} usuario(s) e nao pode ser desativado`,
          "CARGO_EM_USO",
        );
      }
    }

    const atualizado = await repositorio.atualizar(id, normalizada);

    if (atualizado === null) {
      throw new ErroNaoEncontrado("Cargo nao encontrado");
    }

    return atualizado;
  }

  async function remover(id: string): Promise<void> {
    const atual = await repositorio.buscar(id);

    if (atual === null) {
      throw new ErroNaoEncontrado("Cargo nao encontrado");
    }

    const vinculados = await repositorio.contarUsuarios(id);

    if (vinculados > 0) {
      throw new ErroConflito(
        `Este cargo esta em uso por ${vinculados} usuario(s) e nao pode ser excluido`,
        "CARGO_EM_USO",
      );
    }

    await repositorio.remover(id);
  }

  return { listar, criar, atualizar, remover };
}

export const cargosService = criarCargosService();
