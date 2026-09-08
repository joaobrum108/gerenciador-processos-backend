import * as repositorioPadrao from "../repositories/registros-ponto.repository.ts";
import * as usuariosRepositorioPadrao from "../repositories/usuarios.repository.ts";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../erros.ts";
import type {
  DadosPonto,
  FiltrosPonto,
  RegistroPonto,
  StatusPonto,
} from "../repositories/registros-ponto.repository.ts";

export interface EntradaPonto {
  usuarioId: string;
  data: string;
  entrada?: string | null | undefined;
  entradaAlmoco?: string | null | undefined;
  saidaAlmoco?: string | null | undefined;
  saida?: string | null | undefined;
  atrasoMinutos?: number | null | undefined;
  status?: StatusPonto | undefined;
  justificativa?: string | null | undefined;
}

interface DependenciasPonto {
  repositorio: typeof repositorioPadrao;
  usuariosRepositorio: typeof usuariosRepositorioPadrao;
}

export function minutosDe(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * O atraso e a diferenca entre a entrada real e a jornada cadastrada no
 * usuario. Chegar antes nao gera credito, entao o piso e zero.
 */
export function calcularAtraso(
  entradaReal: string | null,
  entradaPrevista: string | null,
): number {
  if (entradaReal === null || entradaPrevista === null) return 0;

  return Math.max(0, minutosDe(entradaReal) - minutosDe(entradaPrevista));
}

export function definirStatus(
  entradaReal: string | null,
  atrasoMinutos: number,
  justificativa: string | null,
): StatusPonto {
  if (entradaReal === null) {
    return justificativa === null ? "FALTA" : "JUSTIFICADO";
  }

  return atrasoMinutos > 0 ? "ATRASO" : "NO_HORARIO";
}

export function criarRegistrosPontoService(
  dependencias: Partial<DependenciasPonto> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;
  const usuariosRepositorio =
    dependencias.usuariosRepositorio ?? usuariosRepositorioPadrao;

  async function montar(
    entrada: EntradaPonto,
    ignorarId: string | null,
  ): Promise<Omit<DadosPonto, "criadoPorUsuarioId">> {
    const usuario = await usuariosRepositorio.buscarPorId(entrada.usuarioId);

    if (usuario === null) {
      throw new ErroValidacao({ usuarioId: ["Colaborador nao encontrado"] });
    }

    const duplicado = await repositorio.buscarPorUsuarioEData(
      entrada.usuarioId,
      entrada.data,
      ignorarId,
    );

    if (duplicado !== null) {
      throw new ErroConflito(
        `Ja existe um registro de ${usuario.nomeExibicao} em ${entrada.data}`,
        "PONTO_DUPLICADO",
      );
    }

    const entradaReal = entrada.entrada ?? null;
    const justificativa = entrada.justificativa ?? null;

    const atrasoMinutos =
      entrada.atrasoMinutos === undefined || entrada.atrasoMinutos === null
        ? calcularAtraso(entradaReal, usuario.entradaExpediente)
        : entrada.atrasoMinutos;

    const status =
      entrada.status ?? definirStatus(entradaReal, atrasoMinutos, justificativa);

    if (status === "JUSTIFICADO" && justificativa === null) {
      throw new ErroValidacao({
        justificativa: ["Informe a justificativa para este status"],
      });
    }

    if (status === "FALTA" && entradaReal !== null) {
      throw new ErroValidacao({
        entrada: ["Uma falta nao pode ter horario de entrada"],
      });
    }

    return {
      usuarioId: entrada.usuarioId,
      data: entrada.data,
      entrada: entradaReal,
      entradaAlmoco: entrada.entradaAlmoco ?? null,
      saidaAlmoco: entrada.saidaAlmoco ?? null,
      saida: entrada.saida ?? null,
      atrasoMinutos,
      status,
      justificativa,
    };
  }

  async function listar(filtros: FiltrosPonto): Promise<RegistroPonto[]> {
    return repositorio.listar(filtros);
  }

  async function listarColaboradores() {
    return repositorio.listarColaboradoresComJornada();
  }

  async function criar(
    entrada: EntradaPonto,
    criadoPorUsuarioId: string | null,
  ): Promise<RegistroPonto> {
    const dados = await montar(entrada, null);
    const criado = await repositorio.criar({ ...dados, criadoPorUsuarioId });

    if (criado === null) {
      throw new ErroNaoEncontrado("Nao foi possivel criar o registro");
    }

    return criado;
  }

  async function atualizar(
    id: string,
    entrada: EntradaPonto,
  ): Promise<RegistroPonto> {
    const atual = await repositorio.buscar(id);

    if (atual === null) {
      throw new ErroNaoEncontrado("Registro de ponto nao encontrado");
    }

    const dados = await montar(entrada, id);
    const atualizado = await repositorio.atualizar(id, dados);

    if (atualizado === null) {
      throw new ErroNaoEncontrado("Registro de ponto nao encontrado");
    }

    return atualizado;
  }

  async function remover(id: string): Promise<void> {
    const removido = await repositorio.remover(id);

    if (!removido) {
      throw new ErroNaoEncontrado("Registro de ponto nao encontrado");
    }
  }

  return { listar, listarColaboradores, criar, atualizar, remover };
}

export const registrosPontoService = criarRegistrosPontoService();
