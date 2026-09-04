import {
  DIAS_JANELA_RELEITURA,
  inicioDoHistorico,
  sincronizacaoService,
} from "../services/services.sincronizacao.ixc.ts";
import {
  contarEspelho,
  liberarCorridasTravadas,
} from "../repositories/repositorio.espelho.ts";
import { encerrarPoolIxc } from "../database/pool.ixc.ts";
import { pool } from "../database/pool.ts";

function dataDoArgumento(indice: number): Date | null {
  const valor = process.argv[indice];

  if (valor === undefined) return null;

  const data = new Date(`${valor}T00:00:00`);

  return Number.isNaN(data.getTime()) ? null : data;
}

function formatar(data: Date): string {
  return data.toISOString().slice(0, 19).replace("T", " ");
}

async function main(): Promise<void> {
  const modo = process.argv[2] ?? "auto";
  const travadas = await liberarCorridasTravadas();

  if (travadas > 0) {
    console.log(`corridas travadas liberadas: ${travadas}`);
  }

  const antes = await contarEspelho();
  const inicio = Date.now();

  if (modo === "historico") {
    const desde = dataDoArgumento(3);
    const ate = dataDoArgumento(4);

    if (desde === null || ate === null) {
      console.error("uso: npm run sincronizar historico AAAA-MM-DD AAAA-MM-DD");
      process.exitCode = 1;
      return;
    }

    ate.setHours(23, 59, 59, 999);
    console.log(`carga historica de ${formatar(desde)} ate ${formatar(ate)}`);

    const r = await sincronizacaoService.cargaHistorica(
      { desde, ate },
      (mes, parcial) => {
        console.log(
          `  ${mes.desde.toISOString().slice(0, 7)}: lidas ${parcial.lidas} | gravadas ${parcial.gravadas}`,
        );
      },
    );

    console.log(`  total: lidas ${r.lidas} | gravadas ${r.gravadas}`);
  } else if (modo === "carga") {
    const desde = dataDoArgumento(3);
    const ate = dataDoArgumento(4);

    if (desde === null || ate === null) {
      console.error("uso: npm run sincronizar carga AAAA-MM-DD AAAA-MM-DD");
      process.exitCode = 1;
      return;
    }

    ate.setHours(23, 59, 59, 999);

    console.log(`carga inicial de ${formatar(desde)} ate ${formatar(ate)}`);
    const r = await sincronizacaoService.cargaInicial({ desde, ate });
    console.log(`  lidas ${r.lidas} | gravadas ${r.gravadas}`);
  } else if (modo === "incremental") {
    console.log(`incremental, releitura de ${DIAS_JANELA_RELEITURA} dias`);
    const r = await sincronizacaoService.sincronizar();
    console.log(
      `  releitura ${formatar(r.releitura.desde)} -> ${formatar(r.releitura.ate)}`,
    );
    if (r.incremental !== null) {
      console.log(
        `  incremental ${formatar(r.incremental.desde)} -> ${formatar(r.incremental.ate)}`,
      );
    }
    console.log(`  lidas ${r.lidas} | gravadas ${r.gravadas}`);
  } else {
    if (antes === 0) {
      console.log(
        `espelho vazio: carregando historico desde ${inicioDoHistorico().toISOString().slice(0, 10)}`,
      );
    } else {
      console.log(`espelho com ${antes} ocorrencias: apenas incremental`);
    }

    const r = await sincronizacaoService.sincronizarTudo((mes, parcial) => {
      console.log(
        `  ${mes.desde.toISOString().slice(0, 7)}: lidas ${parcial.lidas} | gravadas ${parcial.gravadas}`,
      );
    });

    if (r.historico !== null) {
      console.log(`  historico: lidas ${r.historico.lidas} | gravadas ${r.historico.gravadas}`);
    }
    console.log(`  incremental: lidas ${r.incremental.lidas} | gravadas ${r.incremental.gravadas}`);
  }

  const depois = await contarEspelho();
  console.log(
    `espelho: ${antes} -> ${depois} (+${depois - antes}) em ${((Date.now() - inicio) / 1000).toFixed(1)}s`,
  );
}

main()
  .catch((erro: unknown) => {
    console.error("falha na sincronizacao:", erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await encerrarPoolIxc();
    await pool.end();
  });
