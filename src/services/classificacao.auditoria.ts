export type ResultadoAuditoria = "APROVADA_SEM_DIVERGENCIA" | "COM_DIVERGENCIA";

export interface CamposDeVeredito {
  tarefa: string | null;
  assunto: string | null;
  diagnostico: string | null;
}

const ETAPA_DIVERGENCIA = "DIVERGENCIA DE O.S";
const REPROVACAO = "REPROVAD";
const NEGACOES_DE_DIVERGENCIA = ["SEM DIVERG", "NAO HOUVE DIVERG"];

export function normalizar(valor: string | null): string {
  if (valor === null) return "";

  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function nega(texto: string): boolean {
  return NEGACOES_DE_DIVERGENCIA.some((negacao) => texto.includes(negacao));
}

export function apontaDivergencia(valor: string | null): boolean {
  const texto = normalizar(valor);

  return texto.includes(ETAPA_DIVERGENCIA) && !nega(texto);
}

export function reprovou(valor: string | null): boolean {
  return normalizar(valor).includes(REPROVACAO);
}

export function classificarOcorrencia(
  campos: CamposDeVeredito,
): ResultadoAuditoria {
  return apontaDivergencia(campos.tarefa) ||
    apontaDivergencia(campos.assunto) ||
    reprovou(campos.tarefa) ||
    reprovou(campos.diagnostico)
    ? "COM_DIVERGENCIA"
    : "APROVADA_SEM_DIVERGENCIA";
}
