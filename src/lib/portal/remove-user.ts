// Remover um usuário (equipe ou cliente do portal): tenta apagar o login de vez; se o usuário tem histórico (comentários, tarefas…) e o banco não deixa apagar,
// o acesso é DESATIVADO e bloqueado (a pessoa não entra mais), preservando o histórico.
export interface RemoveAdminLike {
  auth: { admin: { deleteUser(id: string): Promise<{ error: { message: string } | null }>; updateUserById(id: string, a: { ban_duration: string }): Promise<{ error: { message: string } | null }> } };
  from(t: 'profiles'): { update(v: Record<string, unknown>): { eq(col: string, v: string): Promise<{ error: { message: string } | null }> } };
}
export type RemoveResult = { ok: true; mode: 'apagado' | 'desativado' } | { ok: false; error: string };

/** Regras antes de remover: não remove a si mesmo nem o último administrador ativo. */
export function removalBlocked(a: { self: boolean; targetRole: string; targetActive: boolean; otherActiveAdmins: number }): string | null {
  if (a.self) return 'Você não pode remover o seu próprio acesso.';
  if (a.targetRole === 'admin' && a.targetActive && a.otherActiveAdmins < 1) return 'Este é o último administrador ativo: não pode ser removido.';
  return null;
}

export async function removeUserAccess(admin: RemoveAdminLike, id: string): Promise<RemoveResult> {
  const off = await admin.from('profiles').update({ active: false }).eq('id', id);   // corta o acesso já, mesmo que o passo seguinte falhe
  if (off.error) return { ok: false, error: 'Não foi possível desativar o usuário agora.' };
  const del = await admin.auth.admin.deleteUser(id);
  if (!del.error) return { ok: true, mode: 'apagado' };
  const ban = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });   // ~100 anos: não consegue mais entrar
  if (ban.error) return { ok: false, error: 'O usuário foi desativado, mas não foi possível bloquear o login. Confira no Supabase (Authentication › Users).' };
  return { ok: true, mode: 'desativado' };
}
