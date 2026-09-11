import * as repositorioAuditoriasPadrao from "../repositories/repositorio.auditorias.ixc.ts";
import * as repositorioPontuacaoPadrao from "../repositories/pontuacao-os.repository.ts";
import * as repositorioRankingPadrao from "../repositories/ranking.repository.ts";
import {
  buscarNomesOperadores,
  buscarFuncionariosDeOperadores,
} from "../repositories/operadores.ixc.ts";
import { classificarOcorrencia } from "./classificacao.auditoria.ts";
import { ErroValidacao } from "../erros.ts";

export interface RegrasRanking {
  pontosPorErro: number;
  erroAcrescenta: boolean;
  pontosPorMinutoAtraso: number;
  atrasoAcrescenta: boolean;
  pontosPorFalta: number;
  faltaAcrescenta: boolean;
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
  usuarioId: string | null;
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
  erroAcrescenta: false,
  pontosPorMinutoAtraso: 0,
  atrasoAcrescenta: false,
  pontosPorFalta: 0,
  faltaAcrescenta: false,
  limiteAltaPerformance: 0,
};

interface DependenciasRanking {
  repositorioAuditorias: typeof repositorioAuditoriasPadrao;
  repositorioPontuacao: typeof repositorioPontuacaoPadrao;
  repositorioRanking: typeof repositorioRankingPadrao;
  buscarNomes: typeof buscarNomesOperadores;
  buscarFuncionarios: typeof buscarFuncionariosDeOperadores;
}

const SEM_AUDITOR = "Nao identificado";

const LIMITE_ITENS = 10;

function duasCasas(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;

  return arredondado === 0 ? 0 : arredondado;
}

function aplicar(total: number, parcela: number, acrescenta: boolean): number {
  return acrescenta ? total + parcela : total - parcela;
}

function somarPorOcorrencia(quantidade: number, valor: number): number {
  let total = 0;

  for (let contador = 0; contador < quantidade; contador += 1) {
    total += valor;
  }

  return total;
}

function itemVazio(auditorIxcId: number, auditor: string): ItemRanking {
  return {
    auditorIxcId,
    usuarioId: null,
    auditor,
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
  };
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
  const buscarNomes = dependencias.buscarNomes ?? buscarNomesOperadores;
  const buscarFuncionarios =
    dependencias.buscarFuncionarios ?? buscarFuncionariosDeOperadores;

  async function regrasVigentes(): Promise<RegrasRanking> {
    const configuracao = await repositorioRanking.buscarConfiguracaoVigente();

    if (configuracao === null) return REGRAS_ZERADAS;

    return {
      pontosPorErro: Number(configuracao.pontosPorErro),
      erroAcrescenta: configuracao.erroAcrescenta,
      pontosPorMinutoAtraso: Number(configuracao.pontosPorMinutoAtraso),
      atrasoAcrescenta: configuracao.atrasoAcrescenta,
      pontosPorFalta: Number(configuracao.pontosPorFalta),
      faltaAcrescenta: configuracao.faltaAcrescenta,
      limiteAltaPerformance: Number(configuracao.limiteAltaPerformance),
    };
  }

  async function gerar(periodo: {
    dataInicio: string;
    dataFim: string;
  }): Promise<RankingGeral> {
    const [{ grupos }, osPorAssunto, pontuacoes, regras, ponto, vinculados] =
      await Promise.all([
        repositorioAuditorias.resumir(periodo),
        repositorioAuditorias.contarOsPorAssunto(periodo),
        repositorioPontuacao.listarRegras(),
        regrasVigentes(),
        repositorioRanking.resumirPontoPorUsuario(periodo),
        repositorioRanking.listarUsuariosVinculados(),
      ]);

    const pontosPorAssunto = new Map(
      pontuacoes.map((regra) => [regra.assuntoOsIxcId, Number(regra.pontos)]),
    );

    const operadores = [
      ...new Set(
        [...grupos, ...osPorAssunto]
          .map((linha) => linha.operadorIxcId)
          .filter((id): id is number => id !== null),
      ),
    ];

    const [nomes, funcionarios] = await Promise.all([
      buscarNomes(operadores),
      buscarFuncionarios(operadores),
    ]);

    const pontoPorFuncionario = new Map(
      ponto.map((linha) => [linha.funcionarioIxcId, linha]),
    );

    const usuarioPorFuncionario = new Map(
      vinculados.map((linha) => [linha.funcionarioIxcId, linha.usuarioId]),
    );

    const porAuditor = new Map<number, ItemRanking>();

    function obterItem(operadorIxcId: number | null): ItemRanking {
      const auditorIxcId = operadorIxcId ?? 0;

      const existente = porAuditor.get(auditorIxcId);

      if (existente !== undefined) return existente;

      const item = itemVazio(
        auditorIxcId,
        nomes.get(auditorIxcId) ?? SEM_AUDITOR,
      );

      porAuditor.set(auditorIxcId, item);

      return item;
    }

    for (const linha of osPorAssunto) {
      const item = obterItem(linha.operadorIxcId);
      const quantidade = Number(linha.osDistintas);
      const pontosDoAssunto =
        pontosPorAssunto.get(String(linha.assuntoIxcId ?? "")) ?? 0;

      item.composicao.osAuditadas += quantidade;

      for (let contador = 0; contador < quantidade; contador += 1) {
        item.composicao.pontosOs += pontosDoAssunto;
      }
    }

    for (const grupo of grupos) {
      if (classificarOcorrencia(grupo) !== "COM_DIVERGENCIA") continue;

      const item = obterItem(grupo.operadorIxcId);

      item.composicao.errosEncontrados += Number(grupo.total);
    }

    for (const item of porAuditor.values()) {
      if (item.auditor === SEM_AUDITOR) {
        const nomeDoGrupo = grupos.find(
          (grupo) => (grupo.operadorIxcId ?? 0) === item.auditorIxcId,
        )?.auditorNome;

        if (nomeDoGrupo != null) item.auditor = nomeDoGrupo;
      }

      const funcionarioIxcId = funcionarios.get(item.auditorIxcId);

      if (funcionarioIxcId === undefined) continue;

      item.usuarioId = usuarioPorFuncionario.get(funcionarioIxcId) ?? null;

      const registro = pontoPorFuncionario.get(funcionarioIxcId);

      if (registro === undefined) continue;

      item.composicao.atrasoMinutos = registro.atrasoMinutos;
      item.composicao.faltas = registro.faltas;
    }

    const itens = [...porAuditor.values()]
      .map((item) => {
        const composicao = {
          ...item.composicao,
          pontosOs: duasCasas(item.composicao.pontosOs),
          pontosErros: duasCasas(
            somarPorOcorrencia(
              item.composicao.errosEncontrados,
              regras.pontosPorErro,
            ),
          ),
          pontosAtrasos: duasCasas(
            somarPorOcorrencia(
              item.composicao.atrasoMinutos,
              regras.pontosPorMinutoAtraso,
            ),
          ),
          pontosFaltas: duasCasas(
            somarPorOcorrencia(item.composicao.faltas, regras.pontosPorFalta),
          ),
        };

        let total = composicao.pontosOs;

        total = aplicar(total, composicao.pontosErros, regras.erroAcrescenta);
        total = aplicar(total, composicao.pontosAtrasos, regras.atrasoAcrescenta);
        total = aplicar(total, composicao.pontosFaltas, regras.faltaAcrescenta);

        const pontuacaoFinal = duasCasas(total);

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
      .map((item, indice) => ({ ...item, posicao: indice + 1 }))
      .slice(0, LIMITE_ITENS);

    return { periodo, regras, itens };
  }

  async function lerConfiguracao(): Promise<RegrasRanking> {
    return regrasVigentes();
  }

  async function definirConfiguracao(dados: {
    pontosPorErro: number;
    erroAcrescenta: boolean;
    pontosPorMinutoAtraso: number;
    atrasoAcrescenta: boolean;
    pontosPorFalta: number;
    faltaAcrescenta: boolean;
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

    if (numeros.some((valor) => valor < 0)) {
      throw new ErroValidacao({
        regras: [
          "Os valores precisam ser positivos; use acrescentar ou descontar para definir o sinal",
        ],
      });
    }

    const gravada = await repositorioRanking.gravarConfiguracao({
      pontosPorErro: dados.pontosPorErro,
      erroAcrescenta: dados.erroAcrescenta,
      pontosPorMinutoAtraso: dados.pontosPorMinutoAtraso,
      atrasoAcrescenta: dados.atrasoAcrescenta,
      pontosPorFalta: dados.pontosPorFalta,
      faltaAcrescenta: dados.faltaAcrescenta,
      limiteAltaPerformance: dados.limiteAltaPerformance,
      criadoPorUsuarioId: dados.usuarioId,
    });

    return {
      pontosPorErro: Number(gravada.pontosPorErro),
      erroAcrescenta: gravada.erroAcrescenta,
      pontosPorMinutoAtraso: Number(gravada.pontosPorMinutoAtraso),
      atrasoAcrescenta: gravada.atrasoAcrescenta,
      pontosPorFalta: Number(gravada.pontosPorFalta),
      faltaAcrescenta: gravada.faltaAcrescenta,
      limiteAltaPerformance: Number(gravada.limiteAltaPerformance),
    };
  }

  return { gerar, lerConfiguracao, definirConfiguracao };
}

export const rankingService = criarRankingService();
