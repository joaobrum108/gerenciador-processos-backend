import * as usuariosRepositorioPadrao from "../repositories/usuarios.repository.ts";
import { ErroConflito, ErroNaoEncontrado } from "../erros.ts";
import type {
  EscalaTrabalho,
  StatusUsuario,
} from "../repositories/usuarios.repository.ts";

export interface Colaborador {
  usuarioId: string;
  nome: string;
  email: string;
  cargoId: string | null;
  cargo: string | null;
  cargoNivel: string | null;
  escala: EscalaTrabalho;
  status: StatusUsuario;
  ativo: boolean;
  entradaExpediente: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string | null;
}

export interface AtualizacaoColaborador {
  nome: string;
  cargoId: string | null;
  escala: EscalaTrabalho;
  entradaExpediente: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string | null;
}

interface DependenciasColaboradores {
  usuariosRepositorio: typeof usuariosRepositorioPadrao;
}

export function criarColaboradoresService(
  dependencias: Partial<DependenciasColaboradores> = {},
) {
  const usuariosRepositorio =
    dependencias.usuariosRepositorio ?? usuariosRepositorioPadrao;

  async function listar(incluirInativos = false): Promise<Colaborador[]> {
    const usuarios = await usuariosRepositorio.listarColaboradores();

    return usuarios
      .filter((usuario) => incluirInativos || usuario.ativo)
      .map((usuario) => ({
        usuarioId: usuario.id,
        nome: usuario.nomeExibicao,
        email: usuario.emailLogin,
        cargoId: usuario.cargoId,
        cargo: usuario.cargo,
        cargoNivel: usuario.cargoNivel,
        escala: usuario.escala,
        status: usuario.status,
        ativo: usuario.ativo,
        entradaExpediente: usuario.entradaExpediente,
        saidaAlmoco: usuario.saidaAlmoco,
        retornoAlmoco: usuario.retornoAlmoco,
        saidaExpediente: usuario.saidaExpediente,
      }));
  }

  async function atualizar(
    usuarioId: string,
    dados: AtualizacaoColaborador,
  ): Promise<void> {
    const atual = await usuariosRepositorio.buscarPorId(usuarioId);

    if (atual === null) {
      throw new ErroNaoEncontrado("Colaborador nao encontrado");
    }

    const atualizado = await usuariosRepositorio.atualizar(
      usuarioId,
      {
        nomeExibicao: dados.nome,
        emailLogin: atual.emailLogin,
        funcionarioIxcId: atual.funcionarioIxcId,
        funcionarioNomeSnapshot: atual.funcionarioNomeSnapshot,
        cargoId: dados.cargoId,
        escala: dados.escala,
        entradaExpediente: dados.entradaExpediente,
        saidaAlmoco: dados.saidaAlmoco,
        retornoAlmoco: dados.retornoAlmoco,
        saidaExpediente: dados.saidaExpediente,
      },
      atual.atualizadoEm,
    );

    if (atualizado === null) {
      throw new ErroConflito(
        "O colaborador foi alterado por outra pessoa. Recarregue a tela.",
        "REGISTRO_DESATUALIZADO",
      );
    }
  }

  return { listar, atualizar };
}

export const colaboradoresService = criarColaboradoresService();
