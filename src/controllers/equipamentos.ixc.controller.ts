import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import * as repositorio from "../repositories/equipamentos.ixc.ts";
import { ixcConfigurado } from "../database/pool.ixc.ts";

const esquemaBusca = z.object({
  tipo: z.enum(["MAC", "SERIAL"]).default("MAC"),
  identificador: z
    .string({ error: "Informe o identificador a buscar" })
    .trim()
    .min(3, "Informe ao menos 3 caracteres"),
});

function normalizar(valor: string): string {
  return valor.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

export async function buscar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tipo, identificador } = esquemaBusca.parse(req.query);

    // Sem IXC a tela cai no preenchimento manual. Responder 200 com a lista
    // vazia e o motivo e melhor do que 503: a busca e um atalho, nao um
    // pre-requisito para registrar a devolucao.
    if (!ixcConfigurado()) {
      res.status(200).json({
        dados: [],
        ixcDisponivel: false,
        motivo: "Integracao com o IXC nao configurada neste ambiente",
      });
      return;
    }

    const dados = await repositorio.buscarPorIdentificador(
      tipo,
      normalizar(identificador),
    );

    // A consulta ao IXC ainda nao foi escrita — ver o bloco de instrucoes em
    // repositories/equipamentos.ixc.ts. Enquanto isso a lista vem vazia, e o
    // front trata isso como "nao achei, digite manualmente".
    res.status(200).json({
      dados,
      ixcDisponivel: true,
      ...(dados.length === 0
        ? { motivo: "Busca de equipamento no IXC ainda nao implementada" }
        : {}),
    });
  } catch (erro) {
    next(erro);
  }
}
