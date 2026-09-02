import { Router } from "express";
import * as permissoesController from "../controllers/permissoes.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.get(
  "/",
  autenticar,
  autorizar("usuarios.permissoes.view", "usuarios.grupos.view"),
  permissoesController.listar,
);

export default router;
