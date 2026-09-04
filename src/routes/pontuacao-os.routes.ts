import { Router } from "express";
import * as controller from "../controllers/pontuacao-os.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get(
  "/",
  autorizar("auditorias.pontuacaoOs.view"),
  controller.listar,
);

router.put(
  "/",
  autorizar("auditorias.pontuacaoOs.view"),
  controller.definir,
);

router.delete(
  "/:assuntoOsIxcId",
  autorizar("auditorias.pontuacaoOs.view"),
  controller.remover,
);

export default router;
