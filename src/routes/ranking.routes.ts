import { Router } from "express";
import * as controller from "../controllers/ranking.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get("/", autorizar("auditorias.rankingGeral.view"), controller.gerar);

router.get(
  "/configuracao",
  autorizar("auditorias.rankingGeral.view"),
  controller.lerConfiguracao,
);

router.put(
  "/configuracao",
  autorizar("auditorias.rankingGeral.view"),
  controller.definirConfiguracao,
);

export default router;
