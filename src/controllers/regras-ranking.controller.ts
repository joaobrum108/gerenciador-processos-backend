import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { regrasRankingService } from "../services/regras-ranking.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";

const esquemaRegra = z.object({
  nome: z.string().trim().min(1, "Informe o nome da regra").max(80),
  pontos: z.coerce.number(),
});

const esquemaId = z.object({ id: z.string().uuid() });

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
    res.status(200).json({ dados: await regrasRankingService.listar() });
  } catch (erro) {
    next(erro);
  }
}

export async function criar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dados = esquemaRegra.parse(req.body);
    const usuarioId = usuarioLogado(req);

    res.status(201).json(await regrasRankingService.criar({ ...dados, usuarioId }));
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
    const { id } = esquemaId.parse(req.params);
    const dados = esquemaRegra.parse(req.body);

    res.status(200).json(await regrasRankingService.definir(id, dados));
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
    const { id } = esquemaId.parse(req.params);

    await regrasRankingService.remover(id);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
