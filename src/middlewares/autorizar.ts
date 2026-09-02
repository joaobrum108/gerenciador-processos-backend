import type { NextFunction, Request, Response } from "express";
import { ErroNaoAutenticado, ErroProibido } from "../erros.ts";

export function autorizar(...permissoesExigidas: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      next(new ErroNaoAutenticado("Token de acesso nao informado", "TOKEN_AUSENTE"));
      return;
    }

    const possui = permissoesExigidas.some((permissao) =>
      req.usuario?.permissoes.includes(permissao)
    );

    if (!possui) {
      next(
        new ErroProibido(
          "Voce nao tem permissao para executar esta acao",
          "PERMISSAO_NEGADA"
        )
      );
      return;
    }

    next();
  };
}
