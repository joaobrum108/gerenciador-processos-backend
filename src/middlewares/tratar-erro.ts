import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ErroAplicacao, ErroConflito, ErroNaoEncontrado } from "../erros.ts";
import type { CamposInvalidos } from "../erros.ts";

interface ErroPostgres {
  code: string;
  constraint?: string;
  detail?: string;
}

function erroDoPostgres(erro: unknown): ErroPostgres | null {
  if (typeof erro !== "object" || erro === null || !("code" in erro)) {
    return null;
  }

  const codigo = (erro as { code: unknown }).code;

  // Os codigos do Postgres tem exatamente 5 caracteres. Erros do Node (ECONNREFUSED
  // e afins) tambem carregam `code`, e nao podem ser confundidos com estes.
  if (typeof codigo !== "string" || !/^[0-9A-Z]{5}$/.test(codigo)) {
    return null;
  }

  return erro as unknown as ErroPostgres;
}

// Traduz violacao de constraint para o status do contrato. Sem isso, uma corrida
// entre a checagem da aplicacao e o INSERT vira 500.
function traduzirErroDoPostgres(erro: unknown): ErroAplicacao | null {
  const pg = erroDoPostgres(erro);

  if (!pg) {
    return null;
  }

  switch (pg.code) {
    case "23505":
      return new ErroConflito(
        "Ja existe um registro com este valor unico",
        "REGISTRO_DUPLICADO"
      );
    case "23503":
      return new ErroConflito(
        "Referencia para um registro que nao existe",
        "REFERENCIA_INVALIDA"
      );
    case "23514":
      return new ErroAplicacao(
        422,
        "DADOS_INVALIDOS",
        "Os dados enviados violam uma regra do banco"
      );
    case "22P02":
    case "22007":
      return new ErroAplicacao(
        422,
        "DADOS_INVALIDOS",
        "Formato invalido em um dos campos enviados"
      );
    default:
      return null;
  }
}

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

  const aplicacao =
    erro instanceof ErroAplicacao ? erro : traduzirErroDoPostgres(erro);

  if (aplicacao) {
    res.status(aplicacao.status).json({
      mensagem: aplicacao.message,
      codigo: aplicacao.codigo,
      ...(aplicacao.campos ? { campos: aplicacao.campos } : {}),
    });
    return;
  }

  console.error(erro);

  res.status(500).json({
    mensagem: "Erro interno do servidor",
    codigo: "ERRO_INTERNO",
  });
}
