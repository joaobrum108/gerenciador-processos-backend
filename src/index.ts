import express from "express";
import cors from "cors";
import { lerEnv } from "./config/env.ts";
import router from "./router.ts";
import { rotaNaoEncontrada, tratarErro } from "./middlewares/tratar-erro.ts";
import { pool } from "./database/pool.ts";

const env = lerEnv();

const app = express();
const port = env.port;

app.use(cors());
app.use(express.json());

app.use("/api/v1", router);

app.use(rotaNaoEncontrada);
app.use(tratarErro);

const servidor = app.listen(port, () => {
  console.log(`servidor rodando na porta ${port} em /api/v1`);
});

// Prazo maximo para o encerramento limpo. Precisa ser menor que os 5s que o
// `tsx watch` espera antes de matar o processo a forca, senao um restart no meio
// de uma requisicao vira "Process didn't exit in 5s".
const PRAZO_ENCERRAMENTO_MS = 3000;

let encerrando = false;

async function encerrar(sinal: string): Promise<void> {
  // Um segundo Ctrl+C nao deve reabrir o processo de encerramento: `pool.end()`
  // rejeita se chamado duas vezes.
  if (encerrando) {
    process.exit(0);
  }
  encerrando = true;

  console.log(`\nRecebido ${sinal}, encerrando...`);

  // `pool.end()` espera todo cliente ser devolvido ao pool e nao resolve
  // enquanto houver uma transacao aberta. Sem este prazo, um restart durante um
  // POST /usuarios deixaria o processo pendurado ate ser morto a forca.
  const prazo = setTimeout(() => {
    console.warn("Encerramento demorou demais; saindo assim mesmo.");
    process.exit(0);
  }, PRAZO_ENCERRAMENTO_MS);
  prazo.unref();

  try {
    servidor.close();
    await pool.end();
  } catch (erro) {
    console.error("Falha ao encerrar recursos:", erro);
  }

  clearTimeout(prazo);
  process.exit(0);
}

process.on("SIGINT", () => void encerrar("SIGINT"));
process.on("SIGTERM", () => void encerrar("SIGTERM"));
