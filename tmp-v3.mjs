import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
const pool = mysql.createPool({ host: process.env.DB_HOST_IXC, user: process.env.DB_USER_IXC, password: process.env.DB_PASS_IXC, database: process.env.DB_NAME_IXC, connectionLimit: 2, connectTimeout: 10000 });
const P = `c.data_fechamento BETWEEN '2026-08-27 00:00:00' AND '2026-08-29 23:59:59'`;

const [t] = await pool.query(`
  SELECT COUNT(*) auditorias,
         SUM(EXISTS (SELECT 1 FROM su_oss_chamado d JOIN su_oss_assunto ad ON d.id_assunto=ad.id
                      WHERE d.id_oss_chamado=c.id AND ad.assunto LIKE '%DIVERGENCIA DE O.S%')) com_divergencia
    FROM su_oss_chamado c JOIN su_oss_assunto a ON c.id_assunto=a.id
   WHERE c.status='F' AND ${P} AND a.assunto LIKE 'AUDITORIA%'`);
const aud = t[0].auditorias, div = Number(t[0].com_divergencia);
console.log("O.S. de AUDITORIA fechadas no periodo:", aud);
console.log("  com divergencia vinculada:", div);
console.log("  aprovadas (sem divergencia):", aud - div);
console.log("  TAXA DE APROVACAO:", ((aud - div) / aud * 100).toFixed(1) + "%");

const [op] = await pool.query(`
  SELECT COUNT(DISTINCT c.id_tecnico) tecnicos, COUNT(DISTINCT c.id_atendente) atendentes
    FROM su_oss_chamado c JOIN su_oss_assunto a ON c.id_assunto=a.id
   WHERE c.status='F' AND ${P} AND a.assunto LIKE 'AUDITORIA%'`);
console.log("\nna O.S. de AUDITORIA -> id_tecnico distintos:", op[0].tecnicos, "| id_atendente distintos:", op[0].atendentes);
await pool.end();
