import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { registrosPontoService } from "../services/registros-ponto.service.ts";
import { STATUS_PONTO } from "../repositories/registros-ponto.repository.ts";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const esquemaHora = z.string().trim().regex(HORA, "Use o formato HH:MM").nullable().optional();
const esquemaData = z.string().regex(DATA_ISO, "Use o formato AAAA-MM-DD");
const esquemaStatus = z.enum(STATUS_PONTO);

const esquemaListagem = z.object({
  dataInicio: esquemaData.optional(),
  dataFim: esquemaData.optional(),
  usuarioId: z.uuid().optional(),
  status: esquemaStatus.optional(),
});

const esquemaRegistro = z.object({
  usuarioId: z.uuid("Informe o colaborador"),
  data: esquemaData,
  entrada: esquemaHora,
  entradaAlmoco: esquemaHora,
  saidaAlmoco: esquemaHora,
  saida: esquemaHora,
  atrasoMinutos: z.coerce.number().int().min(0).nullable().optional(),
  status: esquemaStatus.optional(),
  justificativa: z.string().trim().max(255).nullable().optional(),
});

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filtros = esquemaListagem.parse(req.query);
    res.status(200).json({ dados: await registrosPontoService.listar(filtros) });
  } catch (erro) {
    next(erro);
  }
}

export async function listarColaboradores(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ dados: await registrosPontoService.listarColaboradores() });
  } catch (erro) {
    next(erro);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = esquemaRegistro.parse(req.body);
    res.status(201).json(await registrosPontoService.criar(dados, req.usuario?.id ?? null));
  } catch (erro) {
    next(erro);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const dados = esquemaRegistro.parse(req.body);
    res.status(200).json(await registrosPontoService.atualizar(id, dados));
  } catch (erro) {
    next(erro);
  }
}

export async function remover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    await registrosPontoService.remover(id);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
