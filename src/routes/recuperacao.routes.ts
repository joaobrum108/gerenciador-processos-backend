import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ErroAplicacao } from "../erros.ts";
import { configuracaoRecuperacao, enviarRecuperacao, redefinirSenhaRecuperacao } from "../services/recuperacao.service.ts";

const router = Router();
// Limites por processo. Os registros expiram e o tamanho e limitado.
const limites = new Map<string, { total: number; ate: number }>();
function limitar(chave: string, maximo: number) {
  const agora = Date.now();
  for (const [key, valor] of limites) if (valor.ate <= agora) limites.delete(key);
  const atual = limites.get(chave) ?? { total: 0, ate: agora + 15 * 60_000 };
  if (atual.total >= maximo || (!limites.has(chave) && limites.size >= 10000)) {
    throw new ErroAplicacao(429, "RECUPERACAO_LIMITE", "Aguarde alguns minutos antes de tentar novamente");
  }
  atual.total++;
  limites.set(chave, atual);
}

router.post("/esqueci-senha", (req, res, next) => {
  try {
    limitar(`solicitar:${req.ip}`, 10);
    const { email } = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()) }).parse(req.body);
    limitar(`email:${createHash("sha256").update(email).digest("hex")}`, 3);
    const config = configuracaoRecuperacao();
    // Resposta identica, sem esperar consulta/envio, para nao revelar contas existentes.
    void enviarRecuperacao(email, config).catch(() => console.error("RECUPERACAO_ENVIO_FALHOU: verifique SMTP e banco de dados"));
    res.status(202).json({ mensagem: "Se o e-mail estiver cadastrado e ativo, voce recebera um link para redefinir sua senha." });
  } catch (erro) { next(erro); }
});

router.post("/redefinir-senha", async (req, res, next) => {
  try {
    limitar(`redefinir:${req.ip}`, 20);
    const dados = z.object({
      usuarioId: z.uuid(), token: z.string().min(1).max(2048),
      senhaNova: z.string().min(8).refine(v => Buffer.byteLength(v, "utf8") <= 72, "A senha deve ter no maximo 72 bytes"),
    }).parse(req.body);
    await redefinirSenhaRecuperacao(dados.usuarioId, dados.token, dados.senhaNova);
    res.status(204).send();
  } catch (erro) { next(erro); }
});

export default router;
