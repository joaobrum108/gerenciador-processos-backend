import { Router } from "express";
import * as controllerFuncionarios from "../controllers/controller.funcionarios.ixc.ts";
import { listar as controllerDivergencias } from "../controllers/controllerDivergencias.ixc.ts";
import {
  listar as controllerAuditorias,
  contar as controllerAuditoriasTotal,
  resumir as controllerAuditoriasResumo,
} from "../controllers/controllerAuditorias.ixc.ts";
import { autenticar } from "../middlewares/autenticar.ts";
import { autorizar } from "../middlewares/autorizar.ts";

const routesIxc = Router();

// routesIxc.use(autenticar);

routesIxc.get(
  "/funcionarios",
  autorizar("colaboradores.colaboradores.view", "usuarios.acessosSistema.view"),
  controllerFuncionarios.listar,
);

routesIxc.get("/funcionarios/:id", controllerFuncionarios.detalhar);
routesIxc.get("/divergencias", controllerDivergencias);
routesIxc.get("/auditorias/total", controllerAuditoriasTotal);
routesIxc.get("/auditorias/resumo", controllerAuditoriasResumo);
routesIxc.get("/auditorias", controllerAuditorias);

export default routesIxc;
