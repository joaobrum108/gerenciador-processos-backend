import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { colaboradoresService } from "../services/colaboradores.service.ts";
import { ESCALAS_TRABALHO } from "../repositories/usuarios.repository.ts";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const esquemaHora = z
  .string()
  .trim()
  .regex(HORA, "Use o formato HH:MM")
  .nullable()
  .optional();

const esquemaId = z.object({ usuarioId: z.uuid("Identificador invalido") });

const esquemaAtualizacao = z.object({
  nome: z
    .string({ error: "Informe o nome" })
    .trim()
    .min(1, "Informe o nome")
    .max(150),
  cargoId: z.uuid("Cargo invalido").nullable().optional(),
  escala: z.enum(ESCALAS_TRABALHO).optional(),
  entradaExpediente: esquemaHora,
  saidaAlmoco: esquemaHora,
  retornoAlmoco: esquemaHora,
  saidaExpediente: esquemaHora,
});

const esquemaListagem = z.object({
  incluirInativos: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true"),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { incluirInativos } = esquemaListagem.parse(req.query);

    res
      .status(200)
      .json({ dados: await colaboradoresService.listar(incluirInativos) });
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
    const { usuarioId } = esquemaId.parse(req.params);
    const dados = esquemaAtualizacao.parse(req.body);

    await colaboradoresService.atualizar(usuarioId, {
      nome: dados.nome,
      cargoId: dados.cargoId ?? null,
      escala: dados.escala ?? "5x2",
      entradaExpediente: dados.entradaExpediente ?? null,
      saidaAlmoco: dados.saidaAlmoco ?? null,
      retornoAlmoco: dados.retornoAlmoco ?? null,
      saidaExpediente: dados.saidaExpediente ?? null,
    });

    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
