import { Router } from "express";
import authRoutes from "./routes/auth.routes.ts";
import usuariosRoutes from "./routes/usuarios.routes.ts";
import gruposPermissaoRoutes from "./routes/grupos-permissao.routes.ts";
import permissoesRoutes from "./routes/permissoes.routes.ts";
import routesIxc from "./routes/rotas.ixc.ts";
import pontuacaoOsRoutes from "./routes/pontuacao-os.routes.ts";
import registrosDevolucaoRoutes from "./routes/registros-devolucao.routes.ts";
import agendamentosRoutes from "./routes/agendamentos.routes.ts";
import {
  motivosDevolucaoRoutes,
  paradeirosRoutes,
} from "./routes/parametrizacoes-devolucao.routes.ts";
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
router.use("/registros-devolucao", registrosDevolucaoRoutes);
router.use("/agendamentos", agendamentosRoutes);
router.use("/motivos-devolucao", motivosDevolucaoRoutes);
router.use("/paradeiros", paradeirosRoutes);
router.use("/ranking", rankingRoutes);
router.use("/integracoes/ixc", routesIxc);

export default router;
