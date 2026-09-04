import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { pontuacaoOsService } from "../services/pontuacao-os.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";

const esquemaDefinicao = z.object({
  assuntoOsIxcId: z.string().trim().min(1, "Informe o servico").max(100),
  assuntoOs: z.string().trim().min(1, "Informe o nome do servico").max(150),
  pontos: z.coerce.number(),
});

const esquemaAssunto = z.object({
  assuntoOsIxcId: z.string().trim().min(1).max(100),
});

function usuarioLogado(req: Request): string {
  const id = req.usuario?.id;

  if (id === undefined) {
    throw new ErroNaoAutenticado("Token de acesso nao informado", "TOKEN_AUSENTE");
  }

  return id;
}

export async function listar(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ dados: await pontuacaoOsService.listar() });
  } catch (erro) {
    next(erro);
  }
}

export async function definir(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dados = esquemaDefinicao.parse(req.body);
    const usuarioId = usuarioLogado(req);

    res.status(200).json(await pontuacaoOsService.definir({ ...dados, usuarioId }));
  } catch (erro) {
    next(erro);
  }
}

export async function remover(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { assuntoOsIxcId } = esquemaAssunto.parse(req.params);

    await pontuacaoOsService.remover(assuntoOsIxcId);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
