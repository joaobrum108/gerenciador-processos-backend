import * as repositorioLocalPadrao from "../repositories/repositorio.divergencias.local.ts";
import type {
  DivergenciaLocal,
  PeriodoDivergencias,
} from "../repositories/repositorio.divergencias.local.ts";

export interface Divergencia {
  ocorrenciaIxcId: number;
  chamadoIxcId: number;
  ticketIxcId: number | null;
  clienteIxcId: number | null;
  clienteNome: string | null;
  tituloOs: string | null;
  assuntoIxcId: number;
  assunto: string;
  diagnosticoIxcId: number;
  diagnostico: string;
  tecnicoIxcId: number | null;
  tecnicoNome: string | null;
  auditorIxcId: number | null;
  auditorNome: string | null;
  observacao: string | null;
  tipoDivergencia: string | null;
  abertoEm: string;
  fechadoEm: string;
}

interface DependenciasDivergencias {
  repositorioLocal: typeof repositorioLocalPadrao;
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}

export function formatarDataIxc(data: Date): string {
  return (
    `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}` +
    ` ${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${doisDigitos(data.getSeconds())}`
  );
}

function numeroOuNulo(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

export function paraContrato(linha: DivergenciaLocal): Divergencia {
  return {
    ocorrenciaIxcId: Number(linha.ocorrenciaIxcId),
    chamadoIxcId: Number(linha.chamadoIxcId),
    ticketIxcId: numeroOuNulo(linha.ticketIxcId),
    clienteIxcId: linha.clienteIxcId,
    clienteNome: linha.clienteNome,
    tituloOs: linha.tituloOs,
    assuntoIxcId: linha.assuntoIxcId ?? 0,
    assunto: linha.assunto ?? "",
    diagnosticoIxcId: linha.diagnosticoIxcId ?? 0,
    diagnostico: linha.diagnostico ?? "",
    tecnicoIxcId: linha.tecnicoIxcId,
    tecnicoNome: linha.tecnicoNome,
    auditorIxcId: linha.auditorIxcId,
    auditorNome: linha.auditorNome,
    observacao: linha.observacao,
    tipoDivergencia: linha.tipoDivergencia,
    abertoEm: formatarDataIxc(linha.abertoEm),
    fechadoEm: formatarDataIxc(linha.fechadoEm),
  };
}

export function criarDivergenciasLocalService(
  dependencias: Partial<DependenciasDivergencias> = {},
) {
  const repositorioLocal =
    dependencias.repositorioLocal ?? repositorioLocalPadrao;

  async function listar(periodo: PeriodoDivergencias): Promise<Divergencia[]> {
    const linhas = await repositorioLocal.listar(periodo);

    return linhas.map(paraContrato);
  }

  return { listar };
}

export const divergenciasLocalService = criarDivergenciasLocalService();
