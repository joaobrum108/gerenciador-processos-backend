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

export const motivosDevolucaoRoutes = Router();

motivosDevolucaoRoutes.get(
  "/",
  autenticar,
  autorizar(...PERMISSOES),
  controller.listarMotivos,
);

export const paradeirosRoutes = Router();

paradeirosRoutes.get(
  "/",
  autenticar,
  autorizar(...PERMISSOES),
  controller.listarParadeiros,
);
