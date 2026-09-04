import * as repositorioAuditoriasPadrao from "../repositories/repositorio.auditorias.local.ts";
import * as repositorioPontuacaoPadrao from "../repositories/pontuacao-os.repository.ts";
import * as repositorioRankingPadrao from "../repositories/ranking.repository.ts";
import { classificarOcorrencia } from "./classificacao.auditoria.ts";
import { ErroValidacao } from "../erros.ts";

export interface RegrasRanking {
  pontosPorErro: number;
  pontosPorMinutoAtraso: number;
  pontosPorFalta: number;
  limiteAltaPerformance: number;
}

export interface ComposicaoPontuacao {
  osAuditadas: number;
  pontosOs: number;
  errosEncontrados: number;
  pontosErros: number;
  atrasoMinutos: number;
  pontosAtrasos: number;
  faltas: number;
  pontosFaltas: number;
}

export interface ItemRanking {
  auditorIxcId: number;
  auditor: string;
  cargo: string | null;
  posicao: number;
  pontuacaoFinal: number;
  altaPerformance: boolean;
  premiado: boolean;
  composicao: ComposicaoPontuacao;
}

export interface RankingGeral {
  periodo: { dataInicio: string; dataFim: string };
  regras: RegrasRanking;
  itens: ItemRanking[];
}

export const REGRAS_ZERADAS: RegrasRanking = {
  pontosPorErro: 0,
  pontosPorMinutoAtraso: 0,
  pontosPorFalta: 0,
  limiteAltaPerformance: 0,
};

interface DependenciasRanking {
  repositorioAuditorias: typeof repositorioAuditoriasPadrao;
  repositorioPontuacao: typeof repositorioPontuacaoPadrao;
  repositorioRanking: typeof repositorioRankingPadrao;
}

const SEM_AUDITOR = "Nao identificado";

function duasCasas(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;

  return arredondado === 0 ? 0 : arredondado;
}

export function criarRankingService(
  dependencias: Partial<DependenciasRanking> = {},
) {
  const repositorioAuditorias =
    dependencias.repositorioAuditorias ?? repositorioAuditoriasPadrao;
  const repositorioPontuacao =
    dependencias.repositorioPontuacao ?? repositorioPontuacaoPadrao;
  const repositorioRanking =
    dependencias.repositorioRanking ?? repositorioRankingPadrao;

  async function regrasVigentes(): Promise<RegrasRanking> {
    const configuracao = await repositorioRanking.buscarConfiguracaoVigente();

    if (configuracao === null) return REGRAS_ZERADAS;

    return {
      pontosPorErro: Number(configuracao.pontosPorErro),
      pontosPorMinutoAtraso: Number(configuracao.pontosPorMinutoAtraso),
      pontosPorFalta: Number(configuracao.pontosPorFalta),
      limiteAltaPerformance: Number(configuracao.limiteAltaPerformance),
    };
  }

  async function gerar(periodo: {
    dataInicio: string;
    dataFim: string;
  }): Promise<RankingGeral> {
    const [{ grupos }, pontuacoes, regras] = await Promise.all([
      repositorioAuditorias.resumir(periodo),
      repositorioPontuacao.listarRegras(),
      regrasVigentes(),
    ]);

    const pontosPorAssunto = new Map(
      pontuacoes.map((regra) => [regra.assuntoOsIxcId, Number(regra.pontos)]),
    );

    const porAuditor = new Map<number, ItemRanking>();

    for (const grupo of grupos) {
      const auditorIxcId = grupo.operadorIxcId ?? 0;
      const quantidade = Number(grupo.total);
      const divergente = classificarOcorrencia(grupo) === "COM_DIVERGENCIA";
      const pontosDoAssunto =
        pontosPorAssunto.get(String(grupo.assuntoIxcId ?? "")) ?? 0;

      const item =
        porAuditor.get(auditorIxcId) ??
        ({
          auditorIxcId,
          auditor: grupo.auditorNome ?? SEM_AUDITOR,
          cargo: null,
          posicao: 0,
          pontuacaoFinal: 0,
          altaPerformance: false,
          premiado: false,
          composicao: {
            osAuditadas: 0,
            pontosOs: 0,
            errosEncontrados: 0,
            pontosErros: 0,
            atrasoMinutos: 0,
            pontosAtrasos: 0,
            faltas: 0,
            pontosFaltas: 0,
          },
        } satisfies ItemRanking);

      item.composicao.osAuditadas += quantidade;
      item.composicao.pontosOs += quantidade * pontosDoAssunto;

      if (divergente) item.composicao.errosEncontrados += quantidade;

      porAuditor.set(auditorIxcId, item);
    }

    const itens = [...porAuditor.values()]
      .map((item) => {
        const composicao = {
          ...item.composicao,
          pontosOs: duasCasas(item.composicao.pontosOs),
          pontosErros: duasCasas(
            item.composicao.errosEncontrados * regras.pontosPorErro,
          ),
          pontosAtrasos: duasCasas(
            item.composicao.atrasoMinutos * regras.pontosPorMinutoAtraso,
          ),
          pontosFaltas: duasCasas(
            item.composicao.faltas * regras.pontosPorFalta,
          ),
        };

        const pontuacaoFinal = duasCasas(
          composicao.pontosOs +
            composicao.pontosErros +
            composicao.pontosAtrasos +
            composicao.pontosFaltas,
        );

        return {
          ...item,
          composicao,
          pontuacaoFinal,
          altaPerformance:
            regras.limiteAltaPerformance > 0 &&
            pontuacaoFinal >= regras.limiteAltaPerformance,
        };
      })
      .sort(
        (a, b) =>
          b.pontuacaoFinal - a.pontuacaoFinal ||
          b.composicao.osAuditadas - a.composicao.osAuditadas,
      )
      .map((item, indice) => ({ ...item, posicao: indice + 1 }));

    return { periodo, regras, itens };
  }

  async function lerConfiguracao(): Promise<RegrasRanking> {
    return regrasVigentes();
  }

  async function definirConfiguracao(dados: {
    pontosPorErro: number;
    pontosPorMinutoAtraso: number;
    pontosPorFalta: number;
    limiteAltaPerformance: number;
    usuarioId: string;
  }): Promise<RegrasRanking> {
    const numeros = [
      dados.pontosPorErro,
      dados.pontosPorMinutoAtraso,
      dados.pontosPorFalta,
      dados.limiteAltaPerformance,
    ];

    if (numeros.some((valor) => !Number.isFinite(valor))) {
      throw new ErroValidacao({
        regras: ["Todos os valores precisam ser numeros"],
      });
    }

    if (dados.limiteAltaPerformance < 0) {
      throw new ErroValidacao({
        limiteAltaPerformance: ["O limite nao pode ser negativo"],
      });
    }

    const gravada = await repositorioRanking.gravarConfiguracao({
      pontosPorErro: dados.pontosPorErro,
      pontosPorMinutoAtraso: dados.pontosPorMinutoAtraso,
      pontosPorFalta: dados.pontosPorFalta,
      limiteAltaPerformance: dados.limiteAltaPerformance,
      criadoPorUsuarioId: dados.usuarioId,
    });

    return {
      pontosPorErro: Number(gravada.pontosPorErro),
      pontosPorMinutoAtraso: Number(gravada.pontosPorMinutoAtraso),
      pontosPorFalta: Number(gravada.pontosPorFalta),
      limiteAltaPerformance: Number(gravada.limiteAltaPerformance),
    };
  }

  return { gerar, lerConfiguracao, definirConfiguracao };
}

export const rankingService = criarRankingService();
