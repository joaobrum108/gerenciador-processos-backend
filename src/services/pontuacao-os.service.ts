import * as repositorioPadrao from "../repositories/pontuacao-os.repository.ts";
import { ErroNaoEncontrado, ErroValidacao } from "../erros.ts";

export const PONTOS_PADRAO = 0;
export const PONTOS_MINIMO = 0;
export const PONTOS_MAXIMO = 999;

export interface PontuacaoOs {
  assuntoOsIxcId: string;
  assuntoOs: string;
  pontos: number;
  configurado: boolean;
  ocorrencias: number;
}

interface DependenciasPontuacao {
  repositorio: typeof repositorioPadrao;
}

export function validarPontos(pontos: number): number {
  if (!Number.isFinite(pontos)) {
    throw new ErroValidacao({ pontos: ["Pontos precisa ser um numero"] });
  }

  if (pontos < PONTOS_MINIMO || pontos > PONTOS_MAXIMO) {
    throw new ErroValidacao({
      pontos: [`Pontos precisa estar entre ${PONTOS_MINIMO} e ${PONTOS_MAXIMO}`],
    });
  }

  return Math.round(pontos * 100) / 100;
}

export function criarPontuacaoOsService(
  dependencias: Partial<DependenciasPontuacao> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;

  async function listar(): Promise<PontuacaoOs[]> {
    const [servicos, regras] = await Promise.all([
      repositorio.listarServicosDoEspelho(),
      repositorio.listarRegras(),
    ]);

    const porAssunto = new Map(
      regras.map((regra) => [regra.assuntoOsIxcId, regra]),
    );
    const vistos = new Set<string>();

    const doEspelho = servicos.map((servico) => {
      vistos.add(servico.assuntoOsIxcId);
      const regra = porAssunto.get(servico.assuntoOsIxcId);

      return {
        assuntoOsIxcId: servico.assuntoOsIxcId,
        assuntoOs: regra?.assuntoOs ?? servico.assuntoOs,
        pontos: regra === undefined ? PONTOS_PADRAO : Number(regra.pontos),
        configurado: regra !== undefined,
        ocorrencias: Number(servico.ocorrencias),
      };
    });

    const soltas = regras
      .filter((regra) => !vistos.has(regra.assuntoOsIxcId))
      .map((regra) => ({
        assuntoOsIxcId: regra.assuntoOsIxcId,
        assuntoOs: regra.assuntoOs,
        pontos: Number(regra.pontos),
        configurado: true,
        ocorrencias: 0,
      }));

    return [...doEspelho, ...soltas].sort((a, b) =>
      a.assuntoOs.localeCompare(b.assuntoOs, "pt-BR"),
    );
  }

  async function definir(dados: {
    assuntoOsIxcId: string;
    assuntoOs: string;
    pontos: number;
    usuarioId: string;
  }): Promise<PontuacaoOs> {
    const pontos = validarPontos(dados.pontos);
    const assuntoOs = dados.assuntoOs.trim();

    if (assuntoOs === "") {
      throw new ErroValidacao({ assuntoOs: ["Informe o nome do servico"] });
    }

    const regra = await repositorio.gravarRegra({
      assuntoOsIxcId: dados.assuntoOsIxcId,
      assuntoOs,
      pontos,
      criadoPorUsuarioId: dados.usuarioId,
    });

    return {
      assuntoOsIxcId: regra.assuntoOsIxcId,
      assuntoOs: regra.assuntoOs,
      pontos: Number(regra.pontos),
      configurado: true,
      ocorrencias: 0,
    };
  }

  async function remover(assuntoOsIxcId: string): Promise<void> {
    const removida = await repositorio.removerRegra(assuntoOsIxcId);

    if (!removida) {
      throw new ErroNaoEncontrado("Pontuacao nao encontrada para este servico");
    }
  }

  return { listar, definir, remover };
}

export const pontuacaoOsService = criarPontuacaoOsService();
