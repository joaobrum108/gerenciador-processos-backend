/**
 * O grupo semeado por `api-db-redfox-process` para a conta de manutencao.
 *
 * Essa conta e o grupo dela nao sao administraveis pelo portal: nao aparecem em
 * `GET /usuarios` nem em `GET /grupos-permissao`, nao podem ser abertos por id
 * pelos modulos de administracao e nao podem ser atribuidos a ninguem. O master
 * enxerga a si proprio apenas por `GET /auth/me`, que nao passa por esses
 * filtros — e por isso que ele continua conseguindo entrar e usar o sistema.
 */
export const GRUPO_ADMIN_MASTER = "Administrador Master";

export function ehGrupoMaster(nome: string): boolean {
  return nome.trim().toLowerCase() === GRUPO_ADMIN_MASTER.toLowerCase();
}

export function pertenceAoMaster(grupos: { nome: string }[]): boolean {
  return grupos.some((grupo) => ehGrupoMaster(grupo.nome));
}
