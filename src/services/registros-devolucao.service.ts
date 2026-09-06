import * as repositorioPadrao from "../repositories/registros-devolucao.repository.ts";
import type {
  DadosRegistro,
  FiltrosListagem,
  Ordenacao,
  RegistroDevolucaoRegistro,
} from "../repositories/registros-devolucao.repository.ts";
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from "../erros.ts";

export const MOTIVO_EXCLUSAO_PADRAO = "Excluido pelo usuario";

const FORMATO_MAC = /^[0-9A-F]{12}$/;
const FORMATO_SERIAL = /^[A-Z0-9-]{4,40}$/;
const FORMATO_CODIGO_CLIENTE = /^\d{3,20}$/;

export interface Ator {
  usuarioId: string;
}

export interface EntradaRegistro {
  dataRetirada: string;
  dataDevolucao?: string | null | undefined;
  funcionarioIxcId: string;
  funcionarioNomeSnapshot: string;
  baseIxcId?: string | null | undefined;
  baseNomeSnapshot?: string | null | undefined;
  classeNomeSnapshot?: string | null | undefined;
  clienteIxcId?: string | null | undefined;
  clienteCodigoSnapshot?: string | null | undefined;
  clienteNomeSnapshot?: string | null | undefined;
  modeloIxcId?: string | null | undefined;
  modeloNomeSnapshot: string;
  mac: string;
  serialNumber: string;
  motivoId: string;
  paradeiroId: string;
  recebimento: string;
  status: string;
  observacao?: string | null | undefined;
}

interface DependenciasRegistrosDevolucao {
  repositorio: typeof repositorioPadrao;
}

export function normalizarCodigo(valor: string): string {
  return valor.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

export function formatarMac(macNormalizado: string): string {
  return macNormalizado.match(/.{1,2}/g)?.join(":") ?? macNormalizado;
}

// Espaco em serial e ruido de digitacao ou de leitor de codigo de barras. O
// campo da tela ja remove; o service faz o mesmo para que a API respondesse
// igual a quem a chama direto, e nao so pelo formulario.
export function normalizarSerial(valor: string): string {
  return valor.replace(/\s+/g, "").toUpperCase();
}

export function criarRegistrosDevolucaoService(
  dependencias: Partial<DependenciasRegistrosDevolucao> = {},
) {
  const repositorio = dependencias.repositorio ?? repositorioPadrao;

  // Valida e normaliza numa passada so: o resto do service trabalha sempre com
  // MAC e serial ja no formato que vai para o banco e para a busca de duplicado.
  function prepararEquipamento(entrada: EntradaRegistro): {
    macNormalizado: string;
    macFormatado: string;
    serial: string;
  } {
    const macNormalizado = normalizarCodigo(entrada.mac);

    if (!FORMATO_MAC.test(macNormalizado)) {
      throw new ErroValidacao(
        { mac: ["Informe um MAC com 12 caracteres hexadecimais"] },
        "MAC invalido",
      );
    }

    const serial = normalizarSerial(entrada.serialNumber);

    if (!FORMATO_SERIAL.test(serial)) {
      throw new ErroValidacao(
        { serialNumber: ["Informe um serial com 4 a 40 caracteres"] },
        "Serial number invalido",
      );
    }

    return { macNormalizado, macFormatado: formatarMac(macNormalizado), serial };
  }

  function validarCodigoCliente(codigo: string | null | undefined): void {
    if (codigo === null || codigo === undefined || codigo.trim() === "") {
      return;
    }

    if (!FORMATO_CODIGO_CLIENTE.test(codigo.trim())) {
      throw new ErroValidacao(
        { clienteCodigoSnapshot: ["Informe um codigo de cliente numerico"] },
        "Codigo do cliente invalido",
      );
    }
  }

  function validarDatas(entrada: EntradaRegistro): void {
    const devolucao = entrada.dataDevolucao;

    if (!devolucao) {
      return;
    }

    if (devolucao < entrada.dataRetirada) {
      throw new ErroValidacao(
        { dataDevolucao: ["Nao pode ser anterior a data de retirada"] },
        "Data de devolucao anterior a data de retirada",
      );
    }
  }

  async function garantirEquipamentoLivre(
    macNormalizado: string,
    serial: string,
    ignorarId: string | null,
  ): Promise<void> {
    const pendente = await repositorio.buscarPendentePorMacOuSerial(
      macNormalizado,
      serial,
      ignorarId,
    );

    if (pendente !== null) {
      throw new ErroConflito(
        "Este equipamento ja possui uma devolucao pendente",
        "EQUIPAMENTO_DUPLICADO",
      );
    }
  }

  function montarDados(
    entrada: EntradaRegistro,
    macFormatado: string,
    serial: string,
    ator: Ator,
  ): DadosRegistro {
    return {
      dataRetirada: entrada.dataRetirada,
      dataDevolucao: entrada.dataDevolucao ?? null,
      funcionarioIxcId: entrada.funcionarioIxcId,
      funcionarioNomeSnapshot: entrada.funcionarioNomeSnapshot,
      baseIxcId: entrada.baseIxcId ?? null,
      baseNomeSnapshot: entrada.baseNomeSnapshot ?? null,
      classeNomeSnapshot: entrada.classeNomeSnapshot ?? null,
      clienteIxcId: entrada.clienteIxcId ?? null,
      clienteCodigoSnapshot: entrada.clienteCodigoSnapshot ?? null,
      clienteNomeSnapshot: entrada.clienteNomeSnapshot ?? null,
      modeloIxcId: entrada.modeloIxcId ?? null,
      modeloNomeSnapshot: entrada.modeloNomeSnapshot,
      mac: macFormatado,
      serialNumber: serial,
      motivoId: entrada.motivoId,
      paradeiroId: entrada.paradeiroId,
      recebimento: entrada.recebimento,
      status: entrada.status,
      observacao: entrada.observacao ?? null,
      // Quem decide a conciliacao e o servidor, nunca o cliente: sem id do IXC,
      // o valor foi digitado a mao e o registro nao pode se dizer conciliado.
      conciliadoIxc: (entrada.modeloIxcId ?? null) !== null,
      auditorUsuarioId: ator.usuarioId,
      criadoPorUsuarioId: ator.usuarioId,
    };
  }

  async function listar(
    filtros: FiltrosListagem,
    ordenacao: Ordenacao,
  ): Promise<{ dados: RegistroDevolucaoRegistro[]; total: number }> {
    const [dados, total] = await Promise.all([
      repositorio.listar(filtros, ordenacao),
      repositorio.contar(filtros),
    ]);

    return { dados, total };
  }

  async function buscar(id: string): Promise<RegistroDevolucaoRegistro> {
    const registro = await repositorio.buscarPorId(id);

    if (registro === null) {
      throw new ErroNaoEncontrado("Registro de devolucao nao encontrado");
    }

    return registro;
  }

  async function criar(
    entrada: EntradaRegistro,
    ator: Ator,
  ): Promise<RegistroDevolucaoRegistro> {
    const { macNormalizado, macFormatado, serial } = prepararEquipamento(entrada);
    validarCodigoCliente(entrada.clienteCodigoSnapshot);
    validarDatas(entrada);
    await garantirEquipamentoLivre(macNormalizado, serial, null);

    return repositorio.inserir(montarDados(entrada, macFormatado, serial, ator));
  }

  async function atualizar(
    id: string,
    entrada: EntradaRegistro,
    ator: Ator,
  ): Promise<RegistroDevolucaoRegistro> {
    await buscar(id);

    const { macNormalizado, macFormatado, serial } = prepararEquipamento(entrada);
    validarCodigoCliente(entrada.clienteCodigoSnapshot);
    validarDatas(entrada);
    await garantirEquipamentoLivre(macNormalizado, serial, id);

    const atualizado = await repositorio.atualizar(
      id,
      montarDados(entrada, macFormatado, serial, ator),
    );

    if (atualizado === null) {
      throw new ErroNaoEncontrado("Registro de devolucao nao encontrado");
    }

    return atualizado;
  }

  async function excluir(id: string, ator: Ator): Promise<void> {
    await buscar(id);

    const excluiu = await repositorio.excluirLogico(
      id,
      ator.usuarioId,
      MOTIVO_EXCLUSAO_PADRAO,
    );

    if (!excluiu) {
      throw new ErroNaoEncontrado("Registro de devolucao nao encontrado");
    }
  }

  return { listar, buscar, criar, atualizar, excluir };
}

export const registrosDevolucaoService = criarRegistrosDevolucaoService();
