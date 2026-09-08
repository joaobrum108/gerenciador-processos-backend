import { Router } from "express";
import * as controller from "../controllers/registros-ponto.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

const PERMISSAO = "colaboradores.atrasosPonto.view";

router.use(autenticar);

router.get("/colaboradores", autorizar(PERMISSAO), controller.listarColaboradores);
router.get("/", autorizar(PERMISSAO), controller.listar);
router.post("/", autorizar(PERMISSAO), controller.criar);
router.put("/:id", autorizar(PERMISSAO), controller.atualizar);
router.delete("/:id", autorizar(PERMISSAO), controller.remover);

export default router;
