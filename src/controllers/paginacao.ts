import { z } from "zod";
import type { Request } from "express";

export function esquemaPaginacao(
  ordenacoesPermitidas: string[],
  ordenacaoPadrao: string
) {
  return z.object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
    ordenarPor: z.enum(ordenacoesPermitidas as [string, ...string[]]).default(
      ordenacaoPadrao
    ),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  });
}

export function montarResposta<T>(
  dados: T[],
  total: number,
  pagina: number,
  porPagina: number
) {
  return {
    dados,
    pagina,
    porPagina,
    total,
    totalPaginas: porPagina > 0 ? Math.ceil(total / porPagina) : 0,
  };
}

export function contextoAtor(req: Request) {
  return {
    usuarioId: req.usuario?.id ?? "",
    ipOrigem: req.ip ?? null,
    permissoes: req.usuario?.permissoes ?? [],
  };
}

export function userAgentDe(req: Request): string | null {
  return req.headers["user-agent"] ?? null;
}
