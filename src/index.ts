import express from "express";
import cors from "cors";
import { lerEnv } from "./config/env.ts";
import router from "./router.ts";
import { rotaNaoEncontrada, tratarErro } from "./middlewares/tratar-erro.ts";
import { pool } from "./database/pool.ts";
import { encerrarPoolIxc } from "./database/pool.ixc.ts";
import { iniciarAgendador } from "./services/agendador.sincronizacao.ts";

const env = lerEnv();

const app = express();
const port = env.port;

app.use(cors());
app.use(express.json());

app.use("/api/v1", router);

app.use(rotaNaoEncontrada);
app.use(tratarErro);

const servidor = app.listen(port, () => {
  console.log(`servidor rodando na porta ${port}`);
});

const agendador = iniciarAgendador();

const PRAZO_ENCERRAMENTO_MS = 3000;

let encerrando = false;

async function encerrar(sinal: string): Promise<void> {
  if (encerrando) {
    process.exit(0);
  }
  encerrando = true;

  console.log(`\nRecebido ${sinal}, encerrando...`);

  const prazo = setTimeout(() => {
    console.warn("Encerramento demorou demais; saindo assim mesmo.");
    process.exit(0);
  }, PRAZO_ENCERRAMENTO_MS);
  prazo.unref();

  try {
    if (agendador !== null) clearInterval(agendador);
    servidor.close();
    await Promise.all([pool.end(), encerrarPoolIxc()]);
  } catch (erro) {
    console.error("Falha ao encerrar recursos:", erro);
  }

  clearTimeout(prazo);
  process.exit(0);
}

process.on("SIGINT", () => void encerrar("SIGINT"));
process.on("SIGTERM", () => void encerrar("SIGTERM"));
