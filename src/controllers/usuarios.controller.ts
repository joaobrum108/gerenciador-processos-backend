import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { usuariosService } from "../services/usuarios.service.ts";
import {
  ESCALAS_TRABALHO,
  ORDENACOES_PERMITIDAS,
  STATUS_USUARIO,
} from "../repositories/usuarios.repository.ts";
import { contextoAtor, esquemaPaginacao, montarResposta } from "./paginacao.ts";

const esquemaListagem = esquemaPaginacao(
  ORDENACOES_PERMITIDAS,
  "nomeExibicao"
).extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(["true", "false"]).optional(),
  grupoId: z.uuid().optional(),
});

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

const esquemaCargo = z.string().trim().min(1, "Informe o cargo").max(100);
const esquemaEscala = z.enum(ESCALAS_TRABALHO, {
  error: "Escala invalida. Use 5x2, 6x1 ou 12x36",
});
const esquemaStatusUsuario = z.enum(STATUS_USUARIO, {
  error: "Status invalido. Use ATIVO, INATIVO ou CONVITE_PENDENTE",
});

const esquemaCriacao = z.object({
  nomeExibicao: z.string({ error: "Informe o nome de exibicao" }).trim().min(1, "Informe o nome de exibicao").max(150),
  emailLogin: z.string({ error: "Informe o e-mail" }).trim().min(1, "Informe o e-mail").max(254),
  cargo: esquemaCargo.optional(),
  escala: esquemaEscala.optional(),
  status: esquemaStatusUsuario.optional(),
  provedorAuth: z.enum(["LOCAL", "AD", "SSO"]).default("LOCAL"),
  funcionarioIxcId: z.string().trim().max(100).optional(),
  funcionarioNomeSnapshot: z.string().trim().max(150).optional(),
  grupoIds: z.array(z.uuid()).default([]),
});

const esquemaAtualizacao = z.object({
  nomeExibicao: z.string({ error: "Informe o nome de exibicao" }).trim().min(1, "Informe o nome de exibicao").max(150),
  emailLogin: z.string({ error: "Informe o e-mail" }).trim().min(1, "Informe o e-mail").max(254),
  cargo: esquemaCargo.optional(),
  escala: esquemaEscala.optional(),
  funcionarioIxcId: z.string().trim().max(100).optional(),
  funcionarioNomeSnapshot: z.string().trim().max(150).optional(),
  grupoIds: z.array(z.uuid()).default([]),
  atualizadoEm: z.iso.datetime({ message: "Informe atualizadoEm em ISO 8601" }),
});

const esquemaStatus = z.object({
  ativo: z.boolean({ error: "Informe ativo como true ou false" }),
  motivo: z.string().trim().max(500).optional(),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filtros = esquemaListagem.parse(req.query);

    const { dados, total } = await usuariosService.listar({
      busca: filtros.busca ?? null,
      ativo: filtros.ativo === undefined ? null : filtros.ativo === "true",
      grupoId: filtros.grupoId ?? null,
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
    res.status(200).json(await usuariosService.buscarPorId(id));
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
    const usuario = await usuariosService.criar(entrada, contextoAtor(req));
    res.status(201).json(usuario);
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
    const usuario = await usuariosService.atualizar(
      id,
      entrada,
      contextoAtor(req)
    );
    res.status(200).json(usuario);
  } catch (erro) {
    next(erro);
  }
}

export async function alterarStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const { ativo, motivo } = esquemaStatus.parse(req.body);
    const usuario = await usuariosService.alterarStatus(
      id,
      ativo,
      motivo ?? null,
      contextoAtor(req)
    );
    res.status(200).json(usuario);
  } catch (erro) {
    next(erro);
  }
}

export async function redefinirSenha(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const resultado = await usuariosService.redefinirSenha(
      id,
      contextoAtor(req)
    );
    res.status(200).json(resultado);
  } catch (erro) {
    next(erro);
  }
}
