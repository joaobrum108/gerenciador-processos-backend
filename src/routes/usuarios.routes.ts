import { Router } from "express";
import * as usuariosController from "../controllers/usuarios.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

router.get(
  "/",
  autorizar("usuarios.acessosSistema.view"),
  usuariosController.listar,
);
router.post("/", usuariosController.criar);
router.get("/:id", usuariosController.detalhar);
router.patch("/:id", usuariosController.atualizar);
router.patch("/:id/status", usuariosController.alterarStatus);
router.post("/:id/redefinir-senha", usuariosController.redefinirSenha);

export default router;
