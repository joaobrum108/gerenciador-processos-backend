import * as repositorioPadrao from "../repositories/regras-ranking.repository.ts";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../erros.ts";

export interface RegraRanking {
  id: string;
  nome: string;
  pontos: number;
}

const LIMITE_NOME = 80;

/** numeric(10,2): oito digitos antes da virgula. */
const LIMITE_PONTOS = 99_999_999.99;

interface DependenciasRegrasRanking {
  repositorio: typeof repositorioPadrao;
}

function paraRegra(registro: repositorioPadrao.RegraRankingRegistro): RegraRanking {
  return {
    id: registro.id,
    nome: registro.nome,
    pontos: Number(registro.pontos),
  };
}

export function criarRegrasRankingService(
  dependencias: Partial<DependenciasRegrasRanking> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;

  function validarNome(nome: string): string {
    const limpo = nome.trim();

    if (limpo === "") {
      throw new ErroValidacao({ nome: ["Informe o nome da regra"] });
    }

    if (limpo.length > LIMITE_NOME) {
      throw new ErroValidacao({
        nome: [`O nome passa de ${LIMITE_NOME} caracteres`],
      });
    }

    return limpo;
  }

  function validarPontos(pontos: number): number {
    if (!Number.isFinite(pontos)) {
      throw new ErroValidacao({ pontos: ["Informe um valor numerico"] });
    }

    if (Math.abs(pontos) > LIMITE_PONTOS) {
      throw new ErroValidacao({ pontos: ["Valor fora do limite da coluna"] });
    }

    // Sem arredondar aqui: numeric(10,2) arredonda em decimal exato e o
    // RETURNING devolve o valor gravado. Fazer a conta em float divergiria do
    // banco — 1.005 vira 1.00 no JS e 1.01 no Postgres.
    return pontos;
  }

  async function garantirNomeLivre(
    nome: string,
    ignorarId: string | null,
  ): Promise<void> {
    const existente = await repositorio.buscarPorNome(nome, ignorarId);

    if (existente !== null) {
      throw new ErroConflito(
        `Ja existe uma regra com o nome "${existente.nome}"`,
        "NOME_DUPLICADO",
      );
    }
  }

  async function listar(): Promise<RegraRanking[]> {
    return (await repositorio.listar()).map(paraRegra);
  }

  async function criar(dados: {
    nome: string;
    pontos: number;
    usuarioId: string;
  }): Promise<RegraRanking> {
    const nome = validarNome(dados.nome);
    const pontos = validarPontos(dados.pontos);

    await garantirNomeLivre(nome, null);

    return paraRegra(
      await repositorio.criar({
        nome,
        pontos,
        criadoPorUsuarioId: dados.usuarioId,
      }),
    );
  }

  async function definir(
    id: string,
    dados: { nome: string; pontos: number },
  ): Promise<RegraRanking> {
    const nome = validarNome(dados.nome);
    const pontos = validarPontos(dados.pontos);

    await garantirNomeLivre(nome, id);

    const atualizada = await repositorio.atualizar(id, { nome, pontos });

    if (atualizada === null) {
      throw new ErroNaoEncontrado("Regra nao encontrada", "REGRA_NAO_ENCONTRADA");
    }

    return paraRegra(atualizada);
  }

  async function remover(id: string): Promise<void> {
    if (!(await repositorio.remover(id))) {
      throw new ErroNaoEncontrado("Regra nao encontrada", "REGRA_NAO_ENCONTRADA");
    }
  }

  return { listar, criar, definir, remover };
}

export const regrasRankingService = criarRegrasRankingService();
