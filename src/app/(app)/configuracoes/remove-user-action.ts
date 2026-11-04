'use server';
import { revalidatePath } from 'next/cache';
import { flash, requireModule } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { removalBlocked, removeUserAccess, type RemoveAdminLike } from '@/lib/portal/remove-user';

const BACK: Record<string, string> = { equipe: '/configuracoes?tab=equipe', clientes: '/configuracoes?tab=clientes', portal: '/portal?tab=acessos' };

/** Remove um usuário (só administrador). Apaga o login; se houver histórico, desativa e bloqueia. */
export async function removeUser(id: string, fd: FormData) {
  const { supabase, profile } = await requireModule('configuracoes');
  const back = BACK[String(fd.get('tab'))] ?? BACK.equipe;
  if (profile.role !== 'admin') flash(back, 'err', 'Somente administradores removem usuários.');
  if (!/^[0-9a-f-]{36}$/.test(id)) flash(back, 'err', 'Usuário inválido.');
  const { data: target } = await supabase.from('profiles').select('id, role, active, email').eq('id', id).maybeSingle();
  if (!target) flash(back, 'err', 'Usuário não encontrado.');
  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true).neq('id', id);
  const blocked = removalBlocked({ self: id === profile.id, targetRole: target!.role, targetActive: target!.active, otherActiveAdmins: count ?? 0 });
  if (blocked) flash(back, 'err', blocked);
  let admin;
  try { admin = createAdminClient(); } catch { flash(back, 'err', 'A chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) não está configurada na Vercel.'); }
  const r = await removeUserAccess(admin as unknown as RemoveAdminLike, id);
  revalidatePath('/configuracoes'); revalidatePath('/portal');
  if (!r.ok) flash(back, 'err', r.error);
  flash(back, 'ok', r.mode === 'apagado' ? `Usuário ${target!.email ?? ''} removido.` : `Usuário ${target!.email ?? ''} desativado e bloqueado (ele tem histórico no sistema, por isso não foi apagado).`);
}
