import * as repositorioPadrao from "../repositories/parametrizacoes-devolucao.repository.ts";
import { ErroConflito, ErroNaoEncontrado, ErroRegraNegocio } from "../erros.ts";
import type {
  AlteracaoParametrizacao,
  ParametrizacaoDevolucao,
  TabelaParametrizacao,
} from "../repositories/parametrizacoes-devolucao.repository.ts";

export const TIPOS = {
  motivo: "motivos_devolucao",
  paradeiro: "paradeiros",
} as const;

export type TipoParametrizacao = keyof typeof TIPOS;

const ROTULOS: Record<TipoParametrizacao, string> = {
  motivo: "motivo de devolucao",
  paradeiro: "paradeiro",
};

interface DependenciasParametrizacoes {
  repositorio: typeof repositorioPadrao;
}

export function criarParametrizacoesService(
  dependencias: Partial<DependenciasParametrizacoes> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;

  function tabelaDe(tipo: TipoParametrizacao): TabelaParametrizacao {
    return TIPOS[tipo];
  }

  async function listar(
    tipo: TipoParametrizacao,
    incluirInativos = false,
  ): Promise<ParametrizacaoDevolucao[]> {
    return tipo === "motivo"
      ? repositorio.listarMotivos(incluirInativos)
      : repositorio.listarParadeiros(incluirInativos);
  }

  async function garantirNomeLivre(
    tipo: TipoParametrizacao,
    nome: string,
    ignorarId: string | null,
  ): Promise<void> {
    const existente = await repositorio.buscarPorNome(
      tabelaDe(tipo),
      nome,
      ignorarId,
    );

    if (existente !== null) {
      throw new ErroConflito(
        `Ja existe um ${ROTULOS[tipo]} com o nome "${existente.nome}"`,
        "NOME_DUPLICADO",
      );
    }
  }

  async function criar(
    tipo: TipoParametrizacao,
    dados: { nome: string; criadoPorUsuarioId: string },
  ): Promise<ParametrizacaoDevolucao> {
    const nome = dados.nome.trim();

    await garantirNomeLivre(tipo, nome, null);

    const criado = await repositorio.criar(tabelaDe(tipo), {
      ...dados,
      nome,
    });

    if (criado === null) {
      throw new ErroRegraNegocio(`Nao foi possivel criar o ${ROTULOS[tipo]}`);
    }

    return criado;
  }

  async function atualizar(
    tipo: TipoParametrizacao,
    id: string,
    alteracao: AlteracaoParametrizacao,
  ): Promise<ParametrizacaoDevolucao> {
    const atual = await repositorio.buscar(tabelaDe(tipo), id);

    if (atual === null) {
      throw new ErroNaoEncontrado(`${ROTULOS[tipo]} nao encontrado`);
    }

    const alteracaoNormalizada: AlteracaoParametrizacao = {
      ...alteracao,
      ...(alteracao.nome === undefined ? {} : { nome: alteracao.nome.trim() }),
    };

    if (alteracaoNormalizada.nome !== undefined) {
      await garantirNomeLivre(tipo, alteracaoNormalizada.nome, id);
    }

    const atualizado = await repositorio.atualizar(
      tabelaDe(tipo),
      id,
      alteracaoNormalizada,
    );

    if (atualizado === null) {
      throw new ErroNaoEncontrado(`${ROTULOS[tipo]} nao encontrado`);
    }

    return atualizado;
  }

  return { listar, criar, atualizar };
}

export const parametrizacoesDevolucaoService = criarParametrizacoesService();
