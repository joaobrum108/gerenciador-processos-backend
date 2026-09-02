import { Router } from "express";
import authRoutes from "./routes/auth.routes.ts";
import usuariosRoutes from "./routes/usuarios.routes.ts";
import gruposPermissaoRoutes from "./routes/grupos-permissao.routes.ts";
import permissoesRoutes from "./routes/permissoes.routes.ts";

const router = Router();

router.get("/saude", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/usuarios", usuariosRoutes);
router.use("/grupos-permissao", gruposPermissaoRoutes);
router.use("/permissoes", permissoesRoutes);

export default router;
