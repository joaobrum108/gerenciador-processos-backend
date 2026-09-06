import { Router } from "express";
import * as controller from "../controllers/agendamentos.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";

const router = Router();

router.use(autenticar);

// Sem `autorizar` aqui de proposito: a permissao depende do setor do
// agendamento, e quem resolve isso e o controller.
router.get("/", controller.listar);
router.post("/", controller.criar);
router.patch("/:id", controller.reagendar);
router.patch("/:id/status", controller.alterarStatus);

export default router;
