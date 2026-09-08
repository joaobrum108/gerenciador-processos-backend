import { createHmac, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

function chave(segredo: string, hashSenha: string): Buffer {
  return createHmac("sha256", segredo).update(`recuperacao-senha:${hashSenha}`).digest();
}

export function gerarTokenRecuperacao(id: string, hashSenha: string, segredo: string): string {
  return jwt.sign({}, chave(segredo, hashSenha), {
    algorithm: "HS256", subject: id, audience: "recuperacao-senha",
    expiresIn: "30m", jwtid: randomBytes(24).toString("hex"),
  });
}

export function validarTokenRecuperacao(token: string, id: string, hashSenha: string, segredo: string): void {
  jwt.verify(token, chave(segredo, hashSenha), {
    algorithms: ["HS256"], subject: id, audience: "recuperacao-senha",
  });
}
