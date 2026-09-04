import { sincronizacaoService } from "./services.sincronizacao.ixc.ts";
import { liberarCorridasTravadas } from "../repositories/repositorio.espelho.ts";
import { ixcConfigurado } from "../database/pool.ixc.ts";

export const INTERVALO_PADRAO_MINUTOS = 15;
export const ATRASO_INICIAL_MS = 5_000;

export function intervaloEmMinutos(
  configurado = process.env.SINCRONIZACAO_INTERVALO_MINUTOS,
): number {
  const minutos = Number((configurado ?? "").trim());

  return Number.isFinite(minutos) && minutos > 0
    ? minutos
    : INTERVALO_PADRAO_MINUTOS;
}

export function agendadorAtivo(
  configurado = process.env.SINCRONIZACAO_ATIVA,
): boolean {
  return (configurado ?? "").trim().toLowerCase() !== "false";
}

let rodando = false;

export async function rodarUmaVez(
  registrar: (mensagem: string) => void = console.log,
): Promise<void> {
  if (rodando) {
    registrar("sincronizacao: corrida anterior ainda em andamento, pulando");
    return;
  }

  rodando = true;

  try {
    const travadas = await liberarCorridasTravadas();

    if (travadas > 0) {
      registrar(`sincronizacao: ${travadas} corrida(s) travada(s) liberada(s)`);
    }

    const inicio = Date.now();
    const resultado = await sincronizacaoService.sincronizarTudo((mes, parcial) => {
      registrar(
        `sincronizacao: ${mes.desde.toISOString().slice(0, 7)} -> ${parcial.gravadas} gravadas`,
      );
    });

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    if (resultado.historico !== null) {
      registrar(
        `sincronizacao: historico com ${resultado.historico.gravadas} ocorrencias`,
      );
    }

    registrar(
      `sincronizacao: ${resultado.incremental.gravadas} gravadas em ${segundos}s`,
    );
  } catch (erro) {
    registrar(
      `sincronizacao: falhou - ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  } finally {
    rodando = false;
  }
}

export function iniciarAgendador(
  registrar: (mensagem: string) => void = console.log,
): NodeJS.Timeout | null {
  if (!agendadorAtivo()) {
    registrar("sincronizacao: desligada por SINCRONIZACAO_ATIVA=false");
    return null;
  }

  if (!ixcConfigurado()) {
    registrar("sincronizacao: desligada, IXC nao configurado no .env");
    return null;
  }

  const minutos = intervaloEmMinutos();

  registrar(`sincronizacao: ativa, a cada ${minutos} minuto(s)`);

  setTimeout(() => {
    void rodarUmaVez(registrar);
  }, ATRASO_INICIAL_MS);

  const relogio = setInterval(
    () => {
      void rodarUmaVez(registrar);
    },
    minutos * 60_000,
  );

  relogio.unref();

  return relogio;
}
