import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { registrosDevolucaoService } from "../services/registros-devolucao.service.ts";
import { ORDENACOES_PERMITIDAS } from "../repositories/registros-devolucao.repository.ts";
import { contextoAtor, esquemaPaginacao, montarResposta } from "./paginacao.ts";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const esquemaListagem = esquemaPaginacao(
  ORDENACOES_PERMITIDAS,
  "dataRetirada",
).extend({
  // O padrao do helper e "asc"; aqui o mais recente primeiro e o que a tela espera.
  ordem: z.enum(["asc", "desc"]).default("desc"),
  dataInicio: z.string().regex(DATA_ISO, "Use o formato AAAA-MM-DD").optional(),
  dataFim: z.string().regex(DATA_ISO, "Use o formato AAAA-MM-DD").optional(),
  somenteDuplicados: z.enum(["true", "false"]).optional(),
});

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

const opcional = (maximo: number) =>
  z.string().trim().max(maximo).nullable().optional();

const esquemaRegistro = z.object({
  dataRetirada: z
    .string({ error: "Informe a data de retirada" })
    .regex(DATA_ISO, "Use o formato AAAA-MM-DD"),
  dataDevolucao: z
    .string()
    .regex(DATA_ISO, "Use o formato AAAA-MM-DD")
    .nullable()
    .optional(),
  funcionarioIxcId: z
    .string({ error: "Informe o colaborador" })
    .trim()
    .min(1, "Informe o colaborador")
    .max(100),
  funcionarioNomeSnapshot: z
    .string({ error: "Informe o nome do colaborador" })
    .trim()
    .min(1, "Informe o nome do colaborador")
    .max(150),
  baseIxcId: opcional(100),
  baseNomeSnapshot: opcional(100),
  classeNomeSnapshot: opcional(80),
  clienteIxcId: opcional(100),
  clienteCodigoSnapshot: opcional(100),
  clienteNomeSnapshot: opcional(150),
  modeloIxcId: opcional(100),
  modeloNomeSnapshot: z
    .string({ error: "Informe o modelo" })
    .trim()
    .min(1, "Informe o modelo")
    .max(150),
  mac: z.string({ error: "Informe o MAC" }).trim().min(1, "Informe o MAC").max(50),
  serialNumber: z
    .string({ error: "Informe o serial number" })
    .trim()
    .min(1, "Informe o serial number")
    .max(150),
  motivoId: z.uuid("Informe um motivo valido"),
  paradeiroId: z.uuid("Informe um paradeiro valido"),
  recebimento: z.enum(["OK", "PENDENTE", "VERIFICAR_OS", "LICENCA", "LOJA"], {
    error: "Situacao de recebimento invalida",
  }),
  status: z
    .enum(["PENDENTE", "DEVOLVIDO", "CANCELADO"], { error: "Status invalido" })
    .default("PENDENTE"),
  observacao: z.string().trim().nullable().optional(),
});

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filtros = esquemaListagem.parse(req.query);

    const { dados, total } = await registrosDevolucaoService.listar(
      {
        dataInicio: filtros.dataInicio,
        dataFim: filtros.dataFim,
        somenteDuplicados: filtros.somenteDuplicados === "true",
      },
      {
        ordenarPor: filtros.ordenarPor,
        ordem: filtros.ordem,
        pagina: filtros.pagina,
        porPagina: filtros.porPagina,
      },
    );

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
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);

    res.status(200).json(await registrosDevolucaoService.buscar(id));
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
    const dados = esquemaRegistro.parse(req.body);
    const { usuarioId } = contextoAtor(req);

    const criado = await registrosDevolucaoService.criar(dados, { usuarioId });

    res.status(201).json(criado);
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
    const dados = esquemaRegistro.parse(req.body);
    const { usuarioId } = contextoAtor(req);

    const atualizado = await registrosDevolucaoService.atualizar(id, dados, {
      usuarioId,
    });

    res.status(200).json(atualizado);
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
    const { usuarioId } = contextoAtor(req);

    await registrosDevolucaoService.excluir(id, { usuarioId });

    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
