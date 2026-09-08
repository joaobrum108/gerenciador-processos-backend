import { Router } from "express";
import { autenticar } from "../middlewares/autenticar.ts";
import { ErroNaoAutenticado } from "../erros.ts";
import { suporteService } from "../services/suporte.service.ts";

const router = Router();
router.use(autenticar);

router.post("/mensagens", async (req, res, next) => {
  try {
    if (!req.usuario) throw new ErroNaoAutenticado();
    res.status(200).json(await suporteService.enviar(req.body, req.usuario));
  } catch (erro) {
    next(erro);
  }
});

export default router;
