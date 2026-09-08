import { Router } from "express";
import * as authController from "../controllers/auth.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import recuperacaoRoutes from "./recuperacao.routes.ts";

const router = Router();
router.use(recuperacaoRoutes);

router.post("/login", authController.login);
router.post("/refresh", authController.renovar);
router.post("/logout", authController.sair);
router.get("/me", autenticar, authController.eu);
router.post("/trocar-senha", autenticar, authController.trocarSenha);

export default router;
