import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { parametrizacoesDevolucaoService } from "../services/parametrizacoes-devolucao.service.ts";
import { ErroNaoAutenticado } from "../erros.ts";
import type { TipoParametrizacao } from "../services/parametrizacoes-devolucao.service.ts";

const esquemaListagem = z.object({
  incluirInativos: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true"),
});

const esquemaCriacao = z.object({
  nome: z
    .string({ error: "Informe o nome" })
    .trim()
    .min(1, "Informe o nome")
    .max(100, "O nome deve ter no maximo 100 caracteres"),
});

const esquemaAlteracao = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, "Informe o nome")
      .max(100, "O nome deve ter no maximo 100 caracteres")
      .optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (dados) => dados.nome !== undefined || dados.ativo !== undefined,
    { message: "Informe nome ou ativo", path: ["nome"] },
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

function listar(tipo: TipoParametrizacao) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { incluirInativos } = esquemaListagem.parse(req.query);

      res.status(200).json({
        dados: await parametrizacoesDevolucaoService.listar(
          tipo,
          incluirInativos,
        ),
      });
    } catch (erro) {
      next(erro);
    }
  };
}

function criar(tipo: TipoParametrizacao) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { nome } = esquemaCriacao.parse(req.body);
      const criadoPorUsuarioId = usuarioLogado(req);

      res.status(201).json(
        await parametrizacoesDevolucaoService.criar(tipo, {
          nome,
          criadoPorUsuarioId,
        }),
      );
    } catch (erro) {
      next(erro);
    }
  };
}

function atualizar(tipo: TipoParametrizacao) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = esquemaId.parse(req.params);
      const alteracao = esquemaAlteracao.parse(req.body);

      res
        .status(200)
        .json(
          await parametrizacoesDevolucaoService.atualizar(tipo, id, alteracao),
        );
    } catch (erro) {
      next(erro);
    }
  };
}

export const listarMotivos = listar("motivo");
export const criarMotivo = criar("motivo");
export const atualizarMotivo = atualizar("motivo");

export const listarParadeiros = listar("paradeiro");
export const criarParadeiro = criar("paradeiro");
export const atualizarParadeiro = atualizar("paradeiro");
