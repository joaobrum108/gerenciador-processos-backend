import { Router } from "express";
import * as gruposController from "../controllers/grupos-permissao.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get("/", autorizar("usuarios.grupos.view"), gruposController.listar);
router.post("/", autorizar("usuarios.grupos.criar"), gruposController.criar);
router.get(
  "/:id",
  autorizar("usuarios.grupos.view"),
  gruposController.detalhar,
);
router.patch(
  "/:id",
  autorizar("usuarios.grupos.editar"),
  gruposController.atualizar,
);
router.delete(
  "/:id",
  autorizar("usuarios.grupos.inativar"),
  gruposController.inativar,
);
router.get(
  "/:id/permissoes",
  autorizar("usuarios.permissoes.view"),
  gruposController.listarPermissoes,
);
router.put(
  "/:id/permissoes",
  autorizar("usuarios.permissoes.editar"),
  gruposController.substituirPermissoes,
);

export default router;
