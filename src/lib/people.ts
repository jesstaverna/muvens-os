/** Nome para exibir de uma pessoa da equipe: o nome do perfil ou, se estiver em branco, o e-mail (nunca uma opção vazia). */
export const personName = (p: { full_name?: string | null; email?: string | null } | null | undefined, empty = 'Sem nome'): string => (p ? p.full_name?.trim() || p.email?.trim() || empty : empty);
