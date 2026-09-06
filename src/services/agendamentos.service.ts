import * as repositorioPadrao from "../repositories/agendamentos.repository.ts";
import type {
  AgendamentoRegistro,
  DadosAgendamento,
  FiltrosAgendamento,
} from "../repositories/agendamentos.repository.ts";
import {
  ErroConflito,
  ErroNaoEncontrado,
  ErroRegraNegocio,
  ErroValidacao,
} from "../erros.ts";

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Ator {
  usuarioId: string;
}

export interface TecnicoEntrada {
  ixcId: string;
  nome: string;
  sigla?: string | null | undefined;
}

export interface EntradaAgendamento {
  setor: string;
  tipo: string;
  data: string;
  hora: string;
  tecnicos: TecnicoEntrada[];
  baseIxcId?: string | null | undefined;
  baseNomeSnapshot?: string | null | undefined;
  observacoes?: string | null | undefined;
  status?: string | undefined;
}

interface DependenciasAgendamentos {
  repositorio: typeof repositorioPadrao;
}

export function criarAgendamentosService(
  dependencias: Partial<DependenciasAgendamentos> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;

  function validarHora(hora: string): void {
    if (!FORMATO_HORA.test(hora)) {
      throw new ErroValidacao(
        { hora: ["Use o formato HH:MM, entre 00:00 e 23:59"] },
        "Hora invalida",
      );
    }
  }

  async function garantirSlotLivre(
    setor: string,
    tecnicoIxcId: string,
    rotuloTecnico: string,
    data: string,
    hora: string,
    ignorarId: string | null,
  ): Promise<void> {
    const ocupado = await repositorio.buscarSlotOcupado(
      setor,
      tecnicoIxcId,
      data,
      hora,
      ignorarId,
    );

    if (ocupado !== null) {
      throw new ErroConflito(
        `${rotuloTecnico} ja tem agendamento neste horario`,
        "SLOT_OCUPADO",
      );
    }
  }

  async function buscarOuFalhar(id: string): Promise<AgendamentoRegistro> {
    const registro = await repositorio.buscarPorId(id);

    if (registro === null) {
      throw new ErroNaoEncontrado("Agendamento nao encontrado");
    }

    return registro;
  }

  // Cancelado e estado final. Reativar devolveria o tecnico a um slot que outra
  // pessoa pode ter ocupado nesse meio tempo; o caminho certo e criar de novo.
  function garantirNaoCancelado(registro: AgendamentoRegistro): void {
    if (registro.status === "CANCELADO") {
      throw new ErroRegraNegocio(
        "Agendamento cancelado nao pode ser alterado; crie um novo",
        "AGENDAMENTO_CANCELADO",
      );
    }
  }

  async function criar(
    entrada: EntradaAgendamento,
    ator: Ator,
  ): Promise<AgendamentoRegistro[]> {
    if (entrada.tecnicos.length === 0) {
      throw new ErroValidacao(
        { tecnicos: ["Informe ao menos um tecnico"] },
        "Nenhum tecnico informado",
      );
    }

    validarHora(entrada.hora);

    // Checa todos antes de gravar qualquer um: agendar meia equipe e falhar no
    // resto deixaria o calendario num estado que o usuario nao pediu.
    for (const tecnico of entrada.tecnicos) {
      await garantirSlotLivre(
        entrada.setor,
        tecnico.ixcId,
        tecnico.nome,
        entrada.data,
        entrada.hora,
        null,
      );
    }

    const dados: DadosAgendamento[] = entrada.tecnicos.map((tecnico) => ({
      setor: entrada.setor,
      tecnicoIxcId: tecnico.ixcId.trim(),
      tecnicoNomeSnapshot: tecnico.nome.trim(),
      tecnicoSiglaSnapshot: tecnico.sigla?.trim() || null,
      baseIxcId: entrada.baseIxcId ?? null,
      baseNomeSnapshot: entrada.baseNomeSnapshot ?? null,
      tipo: entrada.tipo,
      data: entrada.data,
      hora: entrada.hora,
      status: entrada.status ?? "AGENDADO",
      observacoes: entrada.observacoes ?? null,
      criadoPorUsuarioId: ator.usuarioId,
    }));

    return repositorio.inserirVarios(dados);
  }

  async function listar(
    filtros: FiltrosAgendamento,
  ): Promise<AgendamentoRegistro[]> {
    return repositorio.listar(filtros);
  }

  async function reagendar(
    id: string,
    destino: { data?: string | undefined; hora?: string | undefined },
    _ator: Ator,
  ): Promise<AgendamentoRegistro> {
    const registro = await buscarOuFalhar(id);

    garantirNaoCancelado(registro);

    const data = destino.data ?? registro.data;
    const hora = destino.hora ?? registro.hora;

    validarHora(hora);

    await garantirSlotLivre(
      registro.setor,
      registro.tecnicoIxcId,
      registro.tecnicoNomeSnapshot,
      data,
      hora,
      id,
    );

    const atualizado = await repositorio.atualizarDataHora(id, data, hora);

    if (atualizado === null) {
      throw new ErroNaoEncontrado("Agendamento nao encontrado");
    }

    return atualizado;
  }

  async function alterarStatus(
    id: string,
    dados: { status: string; motivo?: string | null | undefined },
    ator: Ator,
  ): Promise<AgendamentoRegistro> {
    const registro = await buscarOuFalhar(id);

    if (dados.status !== "CANCELADO") {
      garantirNaoCancelado(registro);
    }

    let cancelamento: {
      canceladoPorUsuarioId: string;
      motivo: string;
    } | null = null;

    if (dados.status === "CANCELADO") {
      const motivo = (dados.motivo ?? "").trim();

      if (motivo === "") {
        throw new ErroValidacao(
          { motivo: ["Informe o motivo do cancelamento"] },
          "Motivo do cancelamento obrigatorio",
        );
      }

      cancelamento = { canceladoPorUsuarioId: ator.usuarioId, motivo };
    }

    const atualizado = await repositorio.atualizarStatus(
      id,
      dados.status,
      cancelamento,
    );

    if (atualizado === null) {
      throw new ErroNaoEncontrado("Agendamento nao encontrado");
    }

    return atualizado;
  }

  return { listar, criar, reagendar, alterarStatus };
}

export const agendamentosService = criarAgendamentosService();
