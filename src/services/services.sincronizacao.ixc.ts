import * as repositorioIxcPadrao from "../repositories/repositorio.sincronizacao.ixc.ts";
import * as repositorioEspelhoPadrao from "../repositories/repositorio.espelho.ts";
import type {
  JanelaLeitura,
  OcorrenciaBruta,
} from "../repositories/repositorio.sincronizacao.ixc.ts";

export const DIAS_JANELA_RELEITURA = 90;
export const FOLGA_MARCA_DAGUA_MINUTOS = 5;
export const INICIO_HISTORICO_PADRAO = "2023-01-01";

export function inicioDoHistorico(
  configurado = process.env.SINCRONIZACAO_INICIO_HISTORICO,
): Date {
  const valor = (configurado ?? "").trim();
  const data = new Date(`${valor === "" ? INICIO_HISTORICO_PADRAO : valor}T00:00:00`);

  return Number.isNaN(data.getTime())
    ? new Date(`${INICIO_HISTORICO_PADRAO}T00:00:00`)
    : data;
}

interface DependenciasSincronizacao {
  repositorioIxc: typeof repositorioIxcPadrao;
  repositorioEspelho: typeof repositorioEspelhoPadrao;
  agora: () => Date;
}

export interface PlanoSincronizacao {
  incremental: JanelaLeitura | null;
  releitura: JanelaLeitura;
  marcaDaguaAte: Date;
}

export interface ResultadoSincronizacao {
  lidas: number;
  gravadas: number;
  incremental: JanelaLeitura | null;
  releitura: JanelaLeitura;
}

function subtrairDias(referencia: Date, dias: number): Date {
  const data = new Date(referencia);
  data.setDate(data.getDate() - dias);

  return data;
}

function subtrairMinutos(referencia: Date, minutos: number): Date {
  return new Date(referencia.getTime() - minutos * 60_000);
}

export function planejar(
  marcaDaguaAnterior: Date | null,
  agora: Date,
  diasReleitura = DIAS_JANELA_RELEITURA,
): PlanoSincronizacao {
  const releitura: JanelaLeitura = {
    desde: subtrairDias(agora, diasReleitura),
    ate: agora,
  };

  if (
    marcaDaguaAnterior === null ||
    marcaDaguaAnterior.getTime() >= agora.getTime()
  ) {
    return { incremental: null, releitura, marcaDaguaAte: agora };
  }

  return {
    incremental: {
      desde: subtrairMinutos(marcaDaguaAnterior, FOLGA_MARCA_DAGUA_MINUTOS),
      ate: agora,
    },
    releitura,
    marcaDaguaAte: agora,
  };
}

export function fatiarPorMes(janela: JanelaLeitura): JanelaLeitura[] {
  const fatias: JanelaLeitura[] = [];
  let inicio = new Date(janela.desde);

  while (inicio.getTime() <= janela.ate.getTime()) {
    const proximo = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
    const fim = new Date(
      Math.min(proximo.getTime() - 1, janela.ate.getTime()),
    );

    fatias.push({ desde: new Date(inicio), ate: fim });
    inicio = proximo;
  }

  return fatias;
}

export function unificar(...lotes: OcorrenciaBruta[][]): OcorrenciaBruta[] {
  const porOcorrencia = new Map<number, OcorrenciaBruta>();

  for (const lote of lotes) {
    for (const ocorrencia of lote) {
      porOcorrencia.set(ocorrencia.ocorrenciaIxcId, ocorrencia);
    }
  }

  return [...porOcorrencia.values()];
}

export function criarSincronizacaoService(
  dependencias: Partial<DependenciasSincronizacao> = {},
) {
  const repositorioIxc = dependencias.repositorioIxc ?? repositorioIxcPadrao;
  const repositorioEspelho =
    dependencias.repositorioEspelho ?? repositorioEspelhoPadrao;
  const agora = dependencias.agora ?? (() => new Date());

  async function sincronizar(
    diasReleitura = DIAS_JANELA_RELEITURA,
  ): Promise<ResultadoSincronizacao> {
    const marcaDaguaAnterior = await repositorioEspelho.ultimaMarcaDagua();
    const plano = planejar(marcaDaguaAnterior, agora(), diasReleitura);

    const corridaId = await repositorioEspelho.abrirCorrida(
      marcaDaguaAnterior,
      plano.marcaDaguaAte,
      plano.releitura.desde,
    );

    try {
      const releitura = await repositorioIxc.lerPorFechamento(plano.releitura);
      const incremental =
        plano.incremental === null
          ? []
          : await repositorioIxc.lerPorAtualizacao(plano.incremental);

      const ocorrencias = unificar(releitura, incremental);
      const gravadas = await repositorioEspelho.gravar(ocorrencias);

      await repositorioEspelho.concluirCorrida(
        corridaId,
        releitura.length + incremental.length,
        gravadas,
      );

      return {
        lidas: releitura.length + incremental.length,
        gravadas,
        incremental: plano.incremental,
        releitura: plano.releitura,
      };
    } catch (erro) {
      await repositorioEspelho.falharCorrida(
        corridaId,
        erro instanceof Error ? erro.message : String(erro),
      );

      throw erro;
    }
  }

  async function cargaInicial(
    janela: JanelaLeitura,
  ): Promise<ResultadoSincronizacao> {
    const corridaId = await repositorioEspelho.abrirCorrida(
      null,
      null,
      janela.desde,
    );

    try {
      const ocorrencias = await repositorioIxc.lerPorFechamento(janela);
      const gravadas = await repositorioEspelho.gravar(ocorrencias);

      await repositorioEspelho.concluirCorrida(
        corridaId,
        ocorrencias.length,
        gravadas,
      );

      return {
        lidas: ocorrencias.length,
        gravadas,
        incremental: null,
        releitura: janela,
      };
    } catch (erro) {
      await repositorioEspelho.falharCorrida(
        corridaId,
        erro instanceof Error ? erro.message : String(erro),
      );

      throw erro;
    }
  }

  async function cargaHistorica(
    janela: JanelaLeitura,
    aoConcluirMes?: (mes: JanelaLeitura, resultado: ResultadoSincronizacao) => void,
  ): Promise<ResultadoSincronizacao> {
    let lidas = 0;
    let gravadas = 0;

    for (const mes of fatiarPorMes(janela)) {
      const parcial = await cargaInicial(mes);

      lidas += parcial.lidas;
      gravadas += parcial.gravadas;
      aoConcluirMes?.(mes, parcial);
    }

    return { lidas, gravadas, incremental: null, releitura: janela };
  }

  async function sincronizarTudo(
    aoConcluirMes?: (mes: JanelaLeitura, resultado: ResultadoSincronizacao) => void,
  ): Promise<{ historico: ResultadoSincronizacao | null; incremental: ResultadoSincronizacao }> {
    const espelhoVazio = (await repositorioEspelho.contarEspelho()) === 0;

    if (!espelhoVazio) {
      return { historico: null, incremental: await sincronizar() };
    }

    const agoraDaCarga = agora();
    const historico = await cargaHistorica(
      { desde: inicioDoHistorico(), ate: agoraDaCarga },
      aoConcluirMes,
    );

    return { historico, incremental: await sincronizar() };
  }

  return { sincronizar, cargaInicial, cargaHistorica, sincronizarTudo };
}

export const sincronizacaoService = criarSincronizacaoService();
