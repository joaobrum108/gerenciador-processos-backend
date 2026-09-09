import { Router } from "express";
import * as controller from "../controllers/ranking.controller.ts";
import * as regrasController from "../controllers/regras-ranking.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

// As regras avulsas sao mantidas dentro da tela de pontuacao de O.S., mas valem
// para o Ranking Geral. Quem enxerga qualquer um dos dois pode administra-las.
const PERMISSOES_REGRAS = [
  "auditorias.pontuacaoOs.view",
  "auditorias.rankingGeral.view",
] as const;

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

router.get(
  "/regras",
  autorizar(...PERMISSOES_REGRAS),
  regrasController.listar,
);

router.post(
  "/regras",
  autorizar(...PERMISSOES_REGRAS),
  regrasController.criar,
);

router.put(
  "/regras/:id",
  autorizar(...PERMISSOES_REGRAS),
  regrasController.definir,
);

router.delete(
  "/regras/:id",
  autorizar(...PERMISSOES_REGRAS),
  regrasController.remover,
);

export default router;
