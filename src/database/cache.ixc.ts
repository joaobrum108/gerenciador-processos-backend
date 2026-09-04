const MAXIMO_LINHAS_POR_ENTRADA = 20_000;
const MAXIMO_LINHAS_GUARDADAS = 60_000;
const MAXIMO_ENTRADAS = 24;
const TTL_JANELA_ABERTA_MS = 5 * 60 * 1000;
const TTL_JANELA_FECHADA_MS = 60 * 60 * 1000;

interface Entrada<T> {
  valor: T;
  expiraEm: number;
  linhas: number;
}

const entradas = new Map<string, Entrada<unknown>>();

let linhasGuardadas = 0;

function hoje(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function ttlDoPeriodo(dataFim: string): number {
  return dataFim >= hoje() ? TTL_JANELA_ABERTA_MS : TTL_JANELA_FECHADA_MS;
}

function tamanho(valor: unknown): number {
  return Array.isArray(valor) ? valor.length : 1;
}

function descartar(chave: string): void {
  const entrada = entradas.get(chave);

  if (entrada === undefined) return;

  linhasGuardadas -= entrada.linhas;
  entradas.delete(chave);
}

function descartarMaisAntiga(): void {
  const primeira = entradas.keys().next();

  if (!primeira.done) descartar(primeira.value);
}

function abrirEspaco(linhas: number): void {
  while (
    entradas.size > 0 &&
    (entradas.size >= MAXIMO_ENTRADAS ||
      linhasGuardadas + linhas > MAXIMO_LINHAS_GUARDADAS)
  ) {
    descartarMaisAntiga();
  }
}

export async function comCache<T>(
  chave: string,
  ttlMs: number,
  buscar: () => Promise<T>,
): Promise<T> {
  const guardada = entradas.get(chave);

  if (guardada !== undefined && guardada.expiraEm > Date.now()) {
    entradas.delete(chave);
    entradas.set(chave, guardada);

    return guardada.valor as T;
  }

  descartar(chave);

  const valor = await buscar();
  const linhas = tamanho(valor);

  if (linhas <= MAXIMO_LINHAS_POR_ENTRADA) {
    abrirEspaco(linhas);

    if (linhasGuardadas + linhas <= MAXIMO_LINHAS_GUARDADAS) {
      entradas.set(chave, { valor, expiraEm: Date.now() + ttlMs, linhas });
      linhasGuardadas += linhas;
    }
  }

  return valor;
}

export function limparCacheIxc(): void {
  entradas.clear();
  linhasGuardadas = 0;
}

export function estadoDoCacheIxc(): {
  entradas: number;
  linhas: number;
  chaves: string[];
} {
  return {
    entradas: entradas.size,
    linhas: linhasGuardadas,
    chaves: [...entradas.keys()],
  };
}
