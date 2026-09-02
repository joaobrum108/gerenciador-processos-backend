import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";
import type { UsuarioAutenticado } from "../services/auth.service.ts";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

export async function autenticar(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cabecalho = req.headers.authorization;

    if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
      throw new ErroNaoAutenticado(
        "Token de acesso nao informado",
        "TOKEN_AUSENTE"
      );
    }

    const token = cabecalho.slice("Bearer ".length).trim();

    if (!token) {
      throw new ErroNaoAutenticado(
        "Token de acesso nao informado",
        "TOKEN_AUSENTE"
      );
    }

    req.usuario = await authService.resolverUsuarioDoAccessToken(token);
    next();
  } catch (erro) {
    next(erro);
  }
}
