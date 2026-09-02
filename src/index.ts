import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import router from "./router.ts";

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(router);

app.listen(port, () => {
  console.log(`servidor rodando na porta ${port}`);
});
