import { Router } from "express";
import * as controller from "../controllers/parametrizacoes-devolucao.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

// Quem registra uma devolucao precisa escolher motivo e paradeiro; quem mantem o
// cadastro tambem lista os dois. Qualquer uma das permissoes basta.
const PERMISSOES = [
  "auditorias.registroDevolucao.view",
  "cadastros.parametrosDevolucao.view",
] as const;

const PERMISSAO_CADASTRO = "cadastros.parametrosDevolucao.view";

export const motivosDevolucaoRoutes = Router();

motivosDevolucaoRoutes.use(autenticar);

motivosDevolucaoRoutes.get(
  "/",
  autorizar(...PERMISSOES),
  controller.listarMotivos,
);

motivosDevolucaoRoutes.post(
  "/",
  autorizar(PERMISSAO_CADASTRO),
  controller.criarMotivo,
);

motivosDevolucaoRoutes.put(
  "/:id",
  autorizar(PERMISSAO_CADASTRO),
  controller.atualizarMotivo,
);

export const paradeirosRoutes = Router();

paradeirosRoutes.use(autenticar);

paradeirosRoutes.get(
  "/",
  autorizar(...PERMISSOES),
  controller.listarParadeiros,
);

paradeirosRoutes.post(
  "/",
  autorizar(PERMISSAO_CADASTRO),
  controller.criarParadeiro,
);

paradeirosRoutes.put(
  "/:id",
  autorizar(PERMISSAO_CADASTRO),
  controller.atualizarParadeiro,
);
