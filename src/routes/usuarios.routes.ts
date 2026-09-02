import { Router } from "express";
import * as usuariosController from "../controllers/usuarios.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

// router.use(autenticar);

router.get("/", usuariosController.listar);

// router.get("/", autorizar("usuarios.acessos.view"), usuariosController.listar);
router.post("/", autorizar("usuarios.acessos.criar"), usuariosController.criar);
router.get(
  "/:id",
  autorizar("usuarios.acessos.view"),
  usuariosController.detalhar,
);
router.patch(
  "/:id",
  autorizar("usuarios.acessos.editar"),
  usuariosController.atualizar,
);
router.patch(
  "/:id/status",
  autorizar("usuarios.acessos.status"),
  usuariosController.alterarStatus,
);
router.post(
  "/:id/redefinir-senha",
  autorizar("usuarios.acessos.senha"),
  usuariosController.redefinirSenha,
);

export default router;
