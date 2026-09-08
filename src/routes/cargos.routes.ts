import { Router } from "express";
import * as controller from "../controllers/cargos.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

const PERMISSOES_LEITURA = [
  "colaboradores.cargosFuncoes.view",
  "usuarios.acessosSistema.view",
] as const;

const PERMISSAO_CADASTRO = "colaboradores.cargosFuncoes.view";

router.get("/", autorizar(...PERMISSOES_LEITURA), controller.listar);
router.post("/", autorizar(PERMISSAO_CADASTRO), controller.criar);
router.put("/:id", autorizar(PERMISSAO_CADASTRO), controller.atualizar);
router.delete("/:id", autorizar(PERMISSAO_CADASTRO), controller.remover);

export default router;
