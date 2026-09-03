import * as repositorioDivergenciasPadrao from "../repositories/repositorio.divergencias.ixc.ts";
import type {
  DivergenciaIxc,
  PeriodoDivergencias,
} from "../repositories/repositorio.divergencias.ixc.ts";

interface DependenciasDivergencias {
  repositorioDivergencias: typeof repositorioDivergenciasPadrao;
}

export type Divergencia = DivergenciaIxc;

export function criarDivergenciasService(
  dependencias: Partial<DependenciasDivergencias> = {},
) {
  const repositorioDivergencias =
    dependencias.repositorioDivergencias ?? repositorioDivergenciasPadrao;

  async function listar(periodo: PeriodoDivergencias): Promise<Divergencia[]> {
    const divergencias = await repositorioDivergencias.listar(periodo);

    const idsOperadores = [
      ...new Set(
        divergencias
          .map((divergencia) => divergencia.auditorIxcId)
          .filter((id): id is number => id !== null),
      ),
    ];

    const nomesPorId =
      await repositorioDivergencias.buscarNomesOperadores(idsOperadores);

    return divergencias.map((divergencia) => ({
      ...divergencia,
      auditorNome:
        divergencia.auditorIxcId === null
          ? null
          : (nomesPorId.get(divergencia.auditorIxcId) ?? null),
    }));
  }

  return { listar };
}

export const divergenciasService = criarDivergenciasService();
