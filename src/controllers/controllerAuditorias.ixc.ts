import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { auditoriasService } from "../services/services.auditorias.ixc.ts";

const esquemaPeriodo = z
  .object({
    dataInicio: z.iso.date("Informe dataInicio no formato AAAA-MM-DD"),
    dataFim: z.iso.date("Informe dataFim no formato AAAA-MM-DD"),
  })
  .refine((periodo) => periodo.dataInicio <= periodo.dataFim, {
    message: "dataInicio nao pode ser posterior a dataFim",
    path: ["dataInicio"],
  });

const esquemaListagem = z.object({
  incluirDivergentes: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true"),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodo = esquemaPeriodo.parse(req.query);
    const { incluirDivergentes } = esquemaListagem.parse(req.query);
    const dados = await auditoriasService.listar(periodo, {
      incluirDivergentes,
    });
    res.status(200).json({ dados });
  } catch (erro) {
    next(erro);
  }
}

export async function contar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodo = esquemaPeriodo.parse(req.query);
    const total = await auditoriasService.contar(periodo);
    res.status(200).json({ total });
  } catch (erro) {
    next(erro);
  }
}

export async function resumir(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const periodo = esquemaPeriodo.parse(req.query);
    res.status(200).json(await auditoriasService.resumir(periodo));
  } catch (erro) {
    next(erro);
  }
}
