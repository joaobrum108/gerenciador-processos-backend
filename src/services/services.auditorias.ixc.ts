import * as repositorioAuditoriasPadrao from "../repositories/repositorio.auditorias.ixc.ts";
import type {
  AuditoriaIxc,
  PeriodoAuditorias,
} from "../repositories/repositorio.auditorias.ixc.ts";

interface DependenciasAuditorias {
  repositorioAuditorias: typeof repositorioAuditoriasPadrao;
}

export type ResultadoAuditoria = "APROVADA_SEM_DIVERGENCIA" | "COM_DIVERGENCIA";

export type Auditoria = AuditoriaIxc & { resultado: ResultadoAuditoria };

export function criarAuditoriasService(
  dependencias: Partial<DependenciasAuditorias> = {},
) {
  const repositorioAuditorias =
    dependencias.repositorioAuditorias ?? repositorioAuditoriasPadrao;

  async function listar(periodo: PeriodoAuditorias): Promise<Auditoria[]> {
    const auditorias = await repositorioAuditorias.listar(periodo);

    return auditorias.map((auditoria) => ({
      ...auditoria,
      resultado: "APROVADA_SEM_DIVERGENCIA" as const,
    }));
  }

  return { listar };
}

export const auditoriasService = criarAuditoriasService();
