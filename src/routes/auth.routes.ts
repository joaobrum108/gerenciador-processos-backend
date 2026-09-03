import { Router } from "express";
import * as authController from "../controllers/auth.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";

const router = Router();

router.post("/login", authController.login);
router.post("/refresh", authController.renovar);
router.post("/logout", authController.sair);
router.get("/me", autenticar, authController.eu);
router.post("/trocar-senha", autenticar, authController.trocarSenha);

export default router;
