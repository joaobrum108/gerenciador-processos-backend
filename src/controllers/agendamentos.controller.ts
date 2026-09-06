import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { agendamentosService } from "../services/agendamentos.service.ts";
import * as repositorio from "../repositories/agendamentos.repository.ts";
import { contextoAtor } from "./paginacao.ts";
import { ErroNaoEncontrado, ErroProibido } from "../erros.ts";

const SETORES = ["CONFERENCIA", "FERRAMENTAL", "FROTA"] as const;

const STATUS = [
  "AGENDADO",
  "REALIZADO",
  "NAO_COMPARECEU",
  "NAO_REALIZADO",
  "CANCELADO",
] as const;

const TIPOS = ["DIARIO", "FERIAS", "DESLIGAMENTO", "AJUSTE", "LEGACY"] as const;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O calendario e um componente so, mas cada setor tem a sua permissao. A
 * autorizacao usa sempre o setor do proprio registro, nunca o que veio no corpo
 * — senao bastaria mentir o setor para mexer no calendario de outra area.
 */
const PERMISSAO_POR_SETOR: Record<string, string> = {
  CONFERENCIA: "conferencia.calendarioAgendamentos.view",
  FERRAMENTAL: "ferramental.calendarioFerramental.view",
  FROTA: "frotas.calendarioFrotas.view",
};

function autorizarSetor(req: Request, setor: string): void {
  const exigida = PERMISSAO_POR_SETOR[setor];
  const permissoes = contextoAtor(req).permissoes;

  if (exigida === undefined || !permissoes.includes(exigida)) {
    throw new ErroProibido(
      "Voce nao tem permissao para este calendario",
      "PERMISSAO_NEGADA",
    );
  }
}

const esquemaListagem = z.object({
  setor: z.enum(SETORES),
  tecnicoIxcId: z.string().trim().min(1).optional(),
  status: z.enum(STATUS).optional(),
  dataInicio: z.string().regex(DATA_ISO, "Use AAAA-MM-DD").optional(),
  dataFim: z.string().regex(DATA_ISO, "Use AAAA-MM-DD").optional(),
});

const esquemaId = z.object({ id: z.uuid("Identificador invalido") });

const esquemaCriacao = z.object({
  setor: z.enum(SETORES),
  tipo: z.enum(TIPOS),
  data: z.string().regex(DATA_ISO, "Use AAAA-MM-DD"),
  hora: z.string().regex(HORA, "Use HH:MM"),
  tecnicos: z
    .array(
      z.object({
        ixcId: z.string().trim().min(1, "Informe o codigo do tecnico").max(100),
        nome: z.string().trim().min(1, "Informe o nome do tecnico").max(150),
        sigla: z.string().trim().max(30).nullable().optional(),
      }),
      { error: "Informe a lista de tecnicos" },
    )
    .min(1, "Informe ao menos um tecnico"),
  baseIxcId: z.string().trim().max(100).nullable().optional(),
  baseNomeSnapshot: z.string().trim().max(100).nullable().optional(),
  observacoes: z.string().trim().nullable().optional(),
  status: z.enum(STATUS).optional(),
});

const esquemaReagendamento = z
  .object({
    data: z.string().regex(DATA_ISO, "Use AAAA-MM-DD").optional(),
    hora: z.string().regex(HORA, "Use HH:MM").optional(),
  })
  .refine(
    (valor) => valor.data !== undefined || valor.hora !== undefined,
    "Informe data, hora ou ambos",
  );

const esquemaStatus = z.object({
  status: z.enum(STATUS),
  motivo: z.string().trim().max(500).nullable().optional(),
});

// Le o setor real do registro para autorizar. Custa um SELECT a mais nas rotas
// de alteracao, e vale: o setor do corpo nao e confiavel.
async function setorDoRegistro(id: string): Promise<string> {
  const registro = await repositorio.buscarPorId(id);

  if (registro === null) {
    throw new ErroNaoEncontrado("Agendamento nao encontrado");
  }

  return registro.setor;
}

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filtros = esquemaListagem.parse(req.query);

    autorizarSetor(req, filtros.setor);

    res.status(200).json(await agendamentosService.listar(filtros));
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
    const dados = esquemaCriacao.parse(req.body);

    autorizarSetor(req, dados.setor);

    const { usuarioId } = contextoAtor(req);

    res.status(201).json(await agendamentosService.criar(dados, { usuarioId }));
  } catch (erro) {
    next(erro);
  }
}

export async function reagendar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const destino = esquemaReagendamento.parse(req.body);

    autorizarSetor(req, await setorDoRegistro(id));

    const { usuarioId } = contextoAtor(req);

    res
      .status(200)
      .json(await agendamentosService.reagendar(id, destino, { usuarioId }));
  } catch (erro) {
    next(erro);
  }
}

export async function alterarStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = esquemaId.parse(req.params);
    const dados = esquemaStatus.parse(req.body);

    autorizarSetor(req, await setorDoRegistro(id));

    const { usuarioId } = contextoAtor(req);

    res
      .status(200)
      .json(await agendamentosService.alterarStatus(id, dados, { usuarioId }));
  } catch (erro) {
    next(erro);
  }
}
