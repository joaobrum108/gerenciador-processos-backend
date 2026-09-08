import { Router } from "express";
import * as controller from "../controllers/colaboradores.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get(
  "/",
  autorizar("colaboradores.colaboradores.view"),
  controller.listar,
);

router.patch(
  "/:usuarioId",
  autorizar("colaboradores.colaboradores.view"),
  controller.atualizar,
);

export default router;
