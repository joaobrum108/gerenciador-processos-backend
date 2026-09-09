import { sincronizacaoService } from "./src/services/services.sincronizacao.ixc.ts";
import { contarEspelho } from "./src/repositories/repositorio.espelho.ts";
import { encerrarPoolIxc } from "./src/database/pool.ixc.ts";
import { pool } from "./src/database/pool.ts";

const meses: Array<[number, number]> = [];
for (let ano = 2023, mes = 1; ano < 2025 || mes <= 2; ) {
  meses.push([ano, mes]);
  mes += 1;
  if (mes > 12) { mes = 1; ano += 1; }
}

const antes = await contarEspelho();
const falhas: string[] = [];

for (const [ano, mes] of meses) {
  const rotulo = `${ano}-${String(mes).padStart(2, "0")}`;
  try {
    const r = await sincronizacaoService.cargaInicial({
      desde: new Date(ano, mes - 1, 1),
      ate: new Date(ano, mes, 0, 23, 59, 59, 999),
    });
    console.log(`  ${rotulo}: gravadas ${r.gravadas}`);
  } catch (erro) {
    falhas.push(rotulo);
    console.log(`  ${rotulo}: FALHA (${erro instanceof Error ? erro.message.slice(0, 50) : erro})`);
  }
}

const depois = await contarEspelho();
console.log(`espelho: ${antes} -> ${depois} (+${depois - antes}) | falhas: ${falhas.join(", ") || "nenhuma"}`);
await encerrarPoolIxc();
await pool.end();
