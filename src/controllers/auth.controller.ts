import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service.ts";
import { userAgentDe } from "./paginacao.ts";

const esquemaLogin = z.object({
  email: z.string({ error: "Informe o e-mail" }).trim().min(1, "Informe o e-mail").max(254),
  senha: z.string({ error: "Informe a senha" }).min(1, "Informe a senha"),
});

const esquemaRefresh = z.object({
  refreshToken: z.string({ error: "Informe o refresh token" }).min(1, "Informe o refresh token"),
});

function contextoRequisicao(req: Request) {
  return {
    ipOrigem: req.ip ?? null,
    userAgent: userAgentDe(req),
  };
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, senha } = esquemaLogin.parse(req.body);
    const resultado = await authService.login(
      email,
      senha,
      contextoRequisicao(req)
    );
    res.status(200).json(resultado);
  } catch (erro) {
    next(erro);
  }
}

export async function renovar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = esquemaRefresh.parse(req.body);
    const resultado = await authService.renovar(
      refreshToken,
      contextoRequisicao(req)
    );
    res.status(200).json(resultado);
  } catch (erro) {
    next(erro);
  }
}

export async function sair(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = esquemaRefresh.parse(req.body);
    await authService.sair(refreshToken);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}

export async function eu(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.status(200).json(req.usuario);
  } catch (erro) {
    next(erro);
  }
}
