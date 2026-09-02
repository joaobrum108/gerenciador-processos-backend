import * as permissoesRepositoryPadrao from "../repositories/permissoes.repository.ts";

export interface ModuloPermissoes {
  modulo: string;
  permissoes: { id: string; nome: string; descricao: string | null }[];
}

interface DependenciasPermissoes {
  permissoesRepository: typeof permissoesRepositoryPadrao;
}

export function criarPermissoesService(
  dependencias: Partial<DependenciasPermissoes> = {}
) {
  const permissoesRepository =
    dependencias.permissoesRepository ?? permissoesRepositoryPadrao;

  async function listarAgrupadas(): Promise<ModuloPermissoes[]> {
    const permissoes = await permissoesRepository.listar();
    const modulos = new Map<string, ModuloPermissoes>();

    for (const permissao of permissoes) {
      const modulo = modulos.get(permissao.modulo) ?? {
        modulo: permissao.modulo,
        permissoes: [],
      };

      modulo.permissoes.push({
        id: permissao.id,
        nome: permissao.nome,
        descricao: permissao.descricao,
      });

      modulos.set(permissao.modulo, modulo);
    }

    return [...modulos.values()];
  }

  return { listarAgrupadas };
}

export const permissoesService = criarPermissoesService();
