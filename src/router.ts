import { Router } from "express";
import authRoutes from "./routes/auth.routes.ts";
import usuariosRoutes from "./routes/usuarios.routes.ts";
import gruposPermissaoRoutes from "./routes/grupos-permissao.routes.ts";
import permissoesRoutes from "./routes/permissoes.routes.ts";
import routesIxc from "./routes/rotas.ixc.ts";
import pontuacaoOsRoutes from "./routes/pontuacao-os.routes.ts";
import rankingRoutes from "./routes/ranking.routes.ts";

const router = Router();

router.get("/saude", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/usuarios", usuariosRoutes);
router.use("/grupos-permissao", gruposPermissaoRoutes);
router.use("/permissoes", permissoesRoutes);
router.use("/pontuacoes-os", pontuacaoOsRoutes);
router.use("/ranking", rankingRoutes);
router.use("/integracoes/ixc", routesIxc);

export default router;
