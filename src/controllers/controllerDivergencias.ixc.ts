import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { divergenciasService } from "../services/services.divergencias.ixc.ts";

const esquemaPeriodo = z
  .object({
    dataInicio: z.iso.date("Informe dataInicio no formato AAAA-MM-DD"),
    dataFim: z.iso.date("Informe dataFim no formato AAAA-MM-DD"),
  })
  .refine((periodo) => periodo.dataInicio <= periodo.dataFim, {
    message: "dataInicio nao pode ser posterior a dataFim",
    path: ["dataInicio"],
  });

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodo = esquemaPeriodo.parse(req.query);
    const dados = await divergenciasService.listar(periodo);
    res.status(200).json({ dados });
  } catch (erro) {
    next(erro);
  }
}
