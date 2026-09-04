import * as repositorioAuditoriasPadrao from "../repositories/repositorio.auditorias.ixc.ts";
import type {
  AuditoriaIxc,
  PeriodoAuditorias,
} from "../repositories/repositorio.auditorias.ixc.ts";

interface CamposDeVeredito {
  tarefa: string | null;
  assunto: string | null;
  diagnostico: string | null;
}

export interface AuditorResumido {
  auditorId: number;
  auditor: string | null;
  total: number;
  aprovadas: number;
  intervaloMedioMinutos: number;
}

export interface ResumoAuditorias {
  total: number;
  aprovadas: number;
  intervaloMedioMinutos: number;
  porAuditor: AuditorResumido[];
}

interface DependenciasAuditorias {
  repositorioAuditorias: typeof repositorioAuditoriasPadrao;
}

export type ResultadoAuditoria = "APROVADA_SEM_DIVERGENCIA" | "COM_DIVERGENCIA";

export type Auditoria = AuditoriaIxc & { resultado: ResultadoAuditoria };

function umaCasa(valor: number): number {
  return Math.round(valor * 10) / 10;
}

const ETAPA_DIVERGENCIA = "DIVERGENCIA DE O.S";
const REPROVACAO = "REPROVAD";
const NEGACOES_DE_DIVERGENCIA = ["SEM DIVERG", "NAO HOUVE DIVERG"];

function normalizar(valor: string | null): string {
  if (valor === null) return "";

  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function nega(texto: string): boolean {
  return NEGACOES_DE_DIVERGENCIA.some((negacao) => texto.includes(negacao));
}

function apontaDivergencia(valor: string | null): boolean {
  const texto = normalizar(valor);

  return texto.includes(ETAPA_DIVERGENCIA) && !nega(texto);
}

function reprovou(valor: string | null): boolean {
  return normalizar(valor).includes(REPROVACAO);
}

function classificar(campos: CamposDeVeredito): ResultadoAuditoria {
  return apontaDivergencia(campos.tarefa) ||
    apontaDivergencia(campos.assunto) ||
    reprovou(campos.tarefa) ||
    reprovou(campos.diagnostico)
    ? "COM_DIVERGENCIA"
    : "APROVADA_SEM_DIVERGENCIA";
}

export function criarAuditoriasService(
  dependencias: Partial<DependenciasAuditorias> = {},
) {
  const repositorioAuditorias =
    dependencias.repositorioAuditorias ?? repositorioAuditoriasPadrao;

  async function listar(periodo: PeriodoAuditorias): Promise<Auditoria[]> {
    const auditorias = await repositorioAuditorias.listar(periodo);

    return auditorias.map((auditoria) => ({
      ...auditoria,
      resultado: classificar(auditoria),
    }));
  }

  async function contar(periodo: PeriodoAuditorias): Promise<number> {
    return repositorioAuditorias.contar(periodo);
  }

  async function resumir(periodo: PeriodoAuditorias): Promise<ResumoAuditorias> {
    const { grupos, intervalos } = await repositorioAuditorias.resumir(periodo);

    const porIntervalo = new Map(
      intervalos.map((intervalo) => [
        intervalo.operadorIxcId ?? 0,
        {
          media: Number(intervalo.intervaloMedioMinutos ?? 0),
          quantidade: Number(intervalo.intervalos ?? 0),
        },
      ]),
    );

    const porAuditor = new Map<number, AuditorResumido>();
    let total = 0;
    let aprovadas = 0;

    for (const grupo of grupos) {
      const auditorId = grupo.operadorIxcId ?? 0;
      const quantidade = Number(grupo.total);
      const aprovado = classificar(grupo) === "APROVADA_SEM_DIVERGENCIA";
      const intervalo = porIntervalo.get(auditorId);

      const atual = porAuditor.get(auditorId) ?? {
        auditorId,
        auditor: grupo.auditorNome,
        total: 0,
        aprovadas: 0,
        intervaloMedioMinutos: umaCasa(intervalo?.media ?? 0),
      };

      atual.total += quantidade;
      if (aprovado) atual.aprovadas += quantidade;
      atual.auditor ??= grupo.auditorNome;

      porAuditor.set(auditorId, atual);

      total += quantidade;
      if (aprovado) aprovadas += quantidade;
    }

    const somaDosIntervalos = intervalos.reduce(
      (soma, intervalo) =>
        soma +
        Number(intervalo.intervaloMedioMinutos ?? 0) *
          Number(intervalo.intervalos ?? 0),
      0,
    );
    const quantidadeDeIntervalos = intervalos.reduce(
      (soma, intervalo) => soma + Number(intervalo.intervalos ?? 0),
      0,
    );

    return {
      total,
      aprovadas,
      intervaloMedioMinutos:
        quantidadeDeIntervalos === 0
          ? 0
          : umaCasa(somaDosIntervalos / quantidadeDeIntervalos),
      porAuditor: [...porAuditor.values()],
    };
  }

  return { listar, contar, resumir };
}

export const auditoriasService = criarAuditoriasService();
