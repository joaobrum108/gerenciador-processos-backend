import { Router } from "express";
import * as controller from "../controllers/registros-devolucao.controller.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const router = Router();

router.use(autenticar);

// O catalogo so tem `.view` para esta tela, entao os cinco verbos usam a mesma
// permissao — quem enxerga o registro tambem pode altera-lo. E o mesmo que
// pontuacao-os faz hoje; separar exige permissoes novas no catalogo do banco.
const PERMISSAO = "auditorias.registroDevolucao.view";

router.get("/", autorizar(PERMISSAO), controller.listar);
router.get("/:id", autorizar(PERMISSAO), controller.detalhar);
router.post("/", autorizar(PERMISSAO), controller.criar);
router.put("/:id", autorizar(PERMISSAO), controller.atualizar);
router.delete("/:id", autorizar(PERMISSAO), controller.remover);

export default router;
