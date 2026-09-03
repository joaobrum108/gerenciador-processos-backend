import { Router } from "express";
import * as usuariosController from "../controllers/usuarios.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

// Toda a administracao de acessos exige a mesma permissao: quem enxerga a tela
// de acessos ao sistema opera nela por inteiro.
const PERMISSAO_ACESSOS = "usuarios.acessosSistema.view";

router.use(autenticar);
router.use(autorizar(PERMISSAO_ACESSOS));

router.get("/", usuariosController.listar);
router.post("/", usuariosController.criar);
router.get("/:id", usuariosController.detalhar);
router.patch("/:id", usuariosController.atualizar);
router.patch("/:id/status", usuariosController.alterarStatus);
router.post("/:id/redefinir-senha", usuariosController.redefinirSenha);

export default router;
