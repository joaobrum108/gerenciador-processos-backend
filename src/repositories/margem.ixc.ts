const MARGEM_PADRAO_DIAS = 7;
const MARGEM_HISTORICA_DIAS = 120;
const PRIMEIRO_DIA_CONFIAVEL = "2023-01-01";

export function margemUltimaAtualizacao(dataInicio: string): number {
  return dataInicio < PRIMEIRO_DIA_CONFIAVEL
    ? MARGEM_HISTORICA_DIAS
    : MARGEM_PADRAO_DIAS;
}
