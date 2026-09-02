import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ErroAplicacao, ErroNaoEncontrado } from "../erros.ts";
import type { CamposInvalidos } from "../erros.ts";

function camposDoZod(erro: ZodError): CamposInvalidos {
  const campos: CamposInvalidos = {};

  for (const problema of erro.issues) {
    const caminho = problema.path.join(".") || "corpo";
    const atuais = campos[caminho] ?? [];
    atuais.push(problema.message);
    campos[caminho] = atuais;
  }

  return campos;
}

export function rotaNaoEncontrada(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new ErroNaoEncontrado("Rota nao encontrada", "ROTA_NAO_ENCONTRADA"));
}

export function tratarErro(
  erro: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(erro);
    return;
  }

  if (erro instanceof ZodError) {
    res.status(422).json({
      mensagem: "Dados invalidos",
      codigo: "DADOS_INVALIDOS",
      campos: camposDoZod(erro),
    });
    return;
  }

  if (erro instanceof ErroAplicacao) {
    res.status(erro.status).json({
      mensagem: erro.message,
      codigo: erro.codigo,
      ...(erro.campos ? { campos: erro.campos } : {}),
    });
    return;
  }

  console.error(erro);

  res.status(500).json({
    mensagem: "Erro interno do servidor",
    codigo: "ERRO_INTERNO",
  });
}
