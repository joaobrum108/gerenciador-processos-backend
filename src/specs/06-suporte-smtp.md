# Envio de suporte por SMTP

`POST /api/v1/suporte/mensagens`, com `Authorization: Bearer <accessToken>`.
Disponivel para usuarios autenticados, como a tela de suporte.

```json
{
  "categoria": "Erro no sistema",
  "prioridade": "Normal",
  "assunto": "Erro ao salvar",
  "descricao": "Nao consegui salvar o registro na tela de conferencia."
}
```

Categorias: Acesso e permissões, Auditoria, Cadastros, Colaboradores,
Conferência, Ferramental, Frotas, Erro no sistema, Outro.
Prioridades: Baixa, Normal, Alta, Crítica.
Assunto: 1 a 100 caracteres, sem quebras de linha. Descricao: 15 a 1000 caracteres.
Campos adicionais sao rejeitados. Solicitante e replyTo vem da autenticacao.

Usa SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS e SMTP_FROM
existentes. SUPORTE_EMAIL_DESTINO define o destinatario; o padrao e
desenvolvimento@redfoxtelecomcom.br, mesmo endereco usado pela tela atual.

Resposta 200: `{ "mensagem": "Solicitacao aceita pelo servidor de e-mail", "enviadoEm": "<ISO 8601>" }`.
Significa aceite pelo SMTP, sem garantia de entrega na caixa de entrada.
Erros: 401 sem autenticacao, 422 dados invalidos, 503 configuracao ausente/invalida,
502 falha ou rejeicao SMTP. Em timeout, o aceite pode ser incerto; reenvio pode duplicar a mensagem.

Esta rota envia e-mail; nao cria ChamadoSuporte, historico persistido nem anexos.
As rotas de chamados e arquivos do documento 03 continuam planejadas.
A tela de suporte consome esta rota com autenticacao, bloqueia envios simultaneos
e preserva o formulario em caso de erro. O historico local registra apenas respostas
de sucesso e e limpo ao sair ou recarregar. Nao abre cliente de e-mail externo.
