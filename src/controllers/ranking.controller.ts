import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { rankingService } from "../services/ranking.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";

const esquemaPeriodo = z
  .object({
    dataInicio: z.iso.date("Informe dataInicio no formato AAAA-MM-DD"),
    dataFim: z.iso.date("Informe dataFim no formato AAAA-MM-DD"),
  })
  .refine((periodo) => periodo.dataInicio <= periodo.dataFim, {
    message: "dataInicio nao pode ser posterior a dataFim",
    path: ["dataInicio"],
  });

const esquemaConfiguracao = z.object({
  pontosPorErro: z.coerce.number(),
  pontosPorMinutoAtraso: z.coerce.number(),
  pontosPorFalta: z.coerce.number(),
  limiteAltaPerformance: z.coerce.number(),
});

function usuarioLogado(req: Request): string {
  const id = req.usuario?.id;

  if (id === undefined) {
    throw new ErroNaoAutenticado("Token de acesso nao informado", "TOKEN_AUSENTE");
  }

  return id;
}

export async function gerar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodo = esquemaPeriodo.parse(req.query);
    res.status(200).json(await rankingService.gerar(periodo));
  } catch (erro) {
    next(erro);
  }
}

export async function lerConfiguracao(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json(await rankingService.lerConfiguracao());
  } catch (erro) {
    next(erro);
  }
}

export async function definirConfiguracao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dados = esquemaConfiguracao.parse(req.body);
    const usuarioId = usuarioLogado(req);

    res.status(200).json(
      await rankingService.definirConfiguracao({ ...dados, usuarioId }),
    );
  } catch (erro) {
    next(erro);
  }
}
