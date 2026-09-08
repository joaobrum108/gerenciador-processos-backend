import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { funcionariosIxcService } from "../services/services.funcionarios.ixc.ts";
import { ORDENACOES_PERMITIDAS } from "../repositories/repository.funcionarios.ixc.ts";
import { esquemaPaginacao, montarResposta } from "./paginacao.ts";

const esquemaId = z.object({
  id: z.coerce
    .number({ error: "Identificador invalido" })
    .int("Identificador invalido")
    .positive("Identificador invalido"),
});

const esquemaListagem = esquemaPaginacao(ORDENACOES_PERMITIDAS, "nome").extend({
  busca: z.string().trim().max(150).optional(),
  ativo: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => (valor === undefined ? undefined : valor === "true")),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pagina, porPagina, ordenarPor, ordem, busca, ativo } =
      esquemaListagem.parse(req.query);

    const { dados, total } = await funcionariosIxcService.listar(
      { busca, ativo },
      { ordenarPor, ordem, pagina, porPagina }
    );

    res.status(200).json(montarResposta(dados, total, pagina, porPagina));
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
