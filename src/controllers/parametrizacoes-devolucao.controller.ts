import type { NextFunction, Request, Response } from "express";
import * as repositorio from "../repositories/parametrizacoes-devolucao.repository.ts";

export async function listarMotivos(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ dados: await repositorio.listarMotivos() });
  } catch (erro) {
    next(erro);
  }
}

export async function listarParadeiros(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ dados: await repositorio.listarParadeiros() });
  } catch (erro) {
    next(erro);
  }
}
