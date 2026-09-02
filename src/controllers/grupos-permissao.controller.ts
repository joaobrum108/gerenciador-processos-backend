import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { gruposPermissaoService } from "../services/grupos-permissao.service.ts";
import { ORDENACOES_PERMITIDAS } from "../repositories/grupos-permissao.repository.ts";
import { contextoAtor, esquemaPaginacao, montarResposta } from "./paginacao.ts";

const esquemaListagem = esquemaPaginacao(ORDENACOES_PERMITIDAS, "nome").extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(["true", "false"]).optional(),
});

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

const esquemaCriacao = z.object({
  nome: z.string({ error: "Informe o nome do grupo" }).trim().min(1, "Informe o nome do grupo").max(80),
  descricao: z.string().trim().max(255).optional(),
});

const esquemaAtualizacao = esquemaCriacao.extend({
  ativo: z.boolean({ error: "Informe ativo como true ou false" }),
  atualizadoEm: z.iso.datetime({ message: "Informe atualizadoEm em ISO 8601" }),
});

const esquemaInativacao = z.object({
  motivo: z.string().trim().max(500).optional(),
});

const esquemaPermissoes = z.object({
  permissaoIds: z.array(z.string().trim().min(1).max(150), { error: "Informe a lista permissaoIds" }),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filtros = esquemaListagem.parse(req.query);

    const { dados, total } = await gruposPermissaoService.listar({
      busca: filtros.busca ?? null,
      ativo: filtros.ativo === undefined ? null : filtros.ativo === "true",
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
    });

    res
      .status(200)
      .json(montarResposta(dados, total, filtros.pagina, filtros.porPagina));
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
    res.status(200).json(await gruposPermissaoService.buscarPorId(id));
  } catch (erro) {
    next(erro);
  }
}

export async function criar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const entrada = esquemaCriacao.parse(req.body);
    const grupo = await gruposPermissaoService.criar(
      entrada,
      contextoAtor(req)
    );
    res.status(201).json(grupo);
  } catch (erro) {
    next(erro);
  }
}

export async function atualizar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const entrada = esquemaAtualizacao.parse(req.body);
    const grupo = await gruposPermissaoService.atualizar(
      id,
      entrada,
      contextoAtor(req)
    );
    res.status(200).json(grupo);
  } catch (erro) {
    next(erro);
  }
}

export async function inativar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const { motivo } = esquemaInativacao.parse(req.body ?? {});
    await gruposPermissaoService.inativar(
      id,
      motivo ?? null,
      contextoAtor(req)
    );
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}

export async function listarPermissoes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const permissaoIds = await gruposPermissaoService.listarPermissoes(id);
    res.status(200).json({ permissaoIds });
  } catch (erro) {
    next(erro);
  }
}

export async function substituirPermissoes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const { permissaoIds } = esquemaPermissoes.parse(req.body);
    const salvas = await gruposPermissaoService.substituirPermissoes(
      id,
      permissaoIds,
      contextoAtor(req)
    );
    res.status(200).json({ permissaoIds: salvas });
  } catch (erro) {
    next(erro);
  }
}
