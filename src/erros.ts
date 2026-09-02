export type CamposInvalidos = Record<string, string[]>;

export class ErroAplicacao extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos: CamposInvalidos | undefined;

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    campos?: CamposInvalidos
  ) {
    super(mensagem);
    this.name = "ErroAplicacao";
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export class ErroValidacao extends ErroAplicacao {
  constructor(campos: CamposInvalidos, mensagem = "Dados invalidos") {
    super(422, "DADOS_INVALIDOS", mensagem, campos);
  }
}

export class ErroNaoAutenticado extends ErroAplicacao {
  constructor(mensagem = "Credenciais invalidas", codigo = "NAO_AUTENTICADO") {
    super(401, codigo, mensagem);
  }
}

export class ErroProibido extends ErroAplicacao {
  constructor(mensagem = "Acesso negado", codigo = "ACESSO_NEGADO") {
    super(403, codigo, mensagem);
  }
}

export class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = "Registro nao encontrado", codigo = "NAO_ENCONTRADO") {
    super(404, codigo, mensagem);
  }
}

export class ErroConflito extends ErroAplicacao {
  constructor(mensagem: string, codigo = "CONFLITO") {
    super(409, codigo, mensagem);
  }
}

export class ErroRegraNegocio extends ErroAplicacao {
  constructor(mensagem: string, codigo = "REGRA_NEGOCIO") {
    super(400, codigo, mensagem);
  }
}
