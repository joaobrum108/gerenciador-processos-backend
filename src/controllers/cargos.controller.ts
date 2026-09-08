import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { cargosService } from "../services/cargos.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";

const esquemaListagem = z.object({
  incluirInativos: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true"),
});

const esquemaNivel = z.string().trim().max(80).nullable().optional();

const esquemaCriacao = z.object({
  nome: z
    .string({ error: "Informe o nome do cargo" })
    .trim()
    .min(1, "Informe o nome do cargo")
    .max(100, "O nome deve ter no maximo 100 caracteres"),
  nivel: esquemaNivel,
});

const esquemaAlteracao = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome do cargo").max(100).optional(),
    nivel: esquemaNivel,
    ativo: z.boolean().optional(),
  })
  .refine(
    (dados) =>
      dados.nome !== undefined ||
      dados.nivel !== undefined ||
      dados.ativo !== undefined,
    { message: "Informe nome, nivel ou ativo", path: ["nome"] },
  );

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

function usuarioLogado(req: Request): string {
  const id = req.usuario?.id;

  if (id === undefined) {
    throw new ErroNaoAutenticado(
      "Token de acesso nao informado",
      "TOKEN_AUSENTE",
    );
  }

  return id;
}

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { incluirInativos } = esquemaListagem.parse(req.query);

    res.status(200).json({ dados: await cargosService.listar(incluirInativos) });
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
    const { nome, nivel } = esquemaCriacao.parse(req.body);

    res.status(201).json(
      await cargosService.criar({
        nome,
        nivel: nivel ?? null,
        criadoPorUsuarioId: usuarioLogado(req),
      }),
    );
  } catch (erro) {
    next(erro);
  }
}

export async function atualizar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const alteracao = esquemaAlteracao.parse(req.body);

    res.status(200).json(await cargosService.atualizar(id, alteracao));
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

    await cargosService.remover(id);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
