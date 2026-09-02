import type { NextFunction, Request, Response } from "express";
import { permissoesService } from "../services/permissoes.service.ts";

export async function listar(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const modulos = await permissoesService.listarAgrupadas();
    res.status(200).json({ modulos });
  } catch (erro) {
    next(erro);
  }
}
