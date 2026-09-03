import * as funcionariosIxcRepositoryPadrao from "../repositories/repository.funcionarios.ixc.ts";
import type { FuncionarioIxc } from "../repositories/repository.funcionarios.ixc.ts";
import { ErroNaoEncontrado } from "../erros.ts";

interface DependenciasFuncionariosIxc {
  funcionariosIxcRepository: typeof funcionariosIxcRepositoryPadrao;
}

export function criarFuncionariosIxcService(
  dependencias: Partial<DependenciasFuncionariosIxc> = {}
) {
  const funcionariosIxcRepository =
    dependencias.funcionariosIxcRepository ?? funcionariosIxcRepositoryPadrao;

  async function listar(): Promise<FuncionarioIxc[]> {
    return funcionariosIxcRepository.listar();
  }

  async function buscarPorId(id: number): Promise<FuncionarioIxc> {
    const funcionario = await funcionariosIxcRepository.buscarPorId(id);

    if (!funcionario) {
      throw new ErroNaoEncontrado(
        "Funcionario nao encontrado no IXC",
        "FUNCIONARIO_IXC_NAO_ENCONTRADO"
      );
    }

    return funcionario;
  }

  return { listar, buscarPorId };
}

export const funcionariosIxcService = criarFuncionariosIxcService();
