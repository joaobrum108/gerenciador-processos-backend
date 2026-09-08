# Recuperacao de senha

- POST /api/v1/auth/esqueci-senha: `{ "email": "usuario@example.com" }`.
  Retorna 202 com mensagem generica. Consulta e envio ocorrem em segundo plano;
  falhas sao sinalizadas no console como RECUPERACAO_ENVIO_FALHOU.
- POST /api/v1/auth/redefinir-senha: `{ "usuarioId": "uuid", "token": "...", "senhaNova": "..." }`.
  Retorna 204 apos alterar a senha. Token invalido/expirado retorna 422.

Usa SMTP existente, JWT_SECRET e FRONTEND_LOGIN_URL. Para o frontend atual:
`FRONTEND_LOGIN_URL="http://localhost:9200/#/login"`.
Use o endereco acessivel aos destinatarios (HTTPS em producao).
As aspas preservam o fragmento # no dotenv.

O login solicita o envio, recebe o link pelo fragmento e permite definir/confirmar
a nova senha. O token sai da URL ao abrir o formulario.
Tokens usam chave derivada por HMAC do segredo e hash da senha, audiencia exclusiva,
identificador aleatorio e validade de 30 minutos. A troca do hash invalida todos os
links anteriores. Atualizacao condicional e revogacao dos refresh tokens sao atomicas.
Access tokens existentes seguem a validade curta ja usada pela autenticacao.

Limites em memoria por processo: 10 solicitacoes/IP e 3/email por 15 minutos;
20 confirmacoes/IP por 15 minutos. Em multiplas instancias, centralizar limites
e fila de envio antes de escalar. O envio atual nao e uma fila persistente.
Nao ha migrations novas nem alteracao de senha ao solicitar o e-mail.
