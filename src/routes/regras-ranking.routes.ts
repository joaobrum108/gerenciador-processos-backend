import { Router } from "express";
import * as controller from "../controllers/regras-ranking.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get("/", autorizar("auditorias.pontuacaoOs.view"), controller.listar);

router.post("/", autorizar("auditorias.pontuacaoOs.view"), controller.criar);

router.put("/:id", autorizar("auditorias.pontuacaoOs.view"), controller.definir);

router.delete(
  "/:id",
  autorizar("auditorias.pontuacaoOs.view"),
  controller.remover,
);

export default router;
