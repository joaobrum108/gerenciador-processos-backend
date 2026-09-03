import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { funcionariosIxcService } from "../services/services.funcionarios.ixc.ts";

const esquemaId = z.object({
  id: z.coerce
    .number({ error: "Identificador invalido" })
    .int("Identificador invalido")
    .positive("Identificador invalido"),
});

export async function listar(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dados = await funcionariosIxcService.listar();
    res.status(200).json({ dados });
  } catch (erro) {
    next(erro);
  }
}

export async function detalhar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    res.status(200).json(await funcionariosIxcService.buscarPorId(id));
  } catch (erro) {
    next(erro);
  }
}
