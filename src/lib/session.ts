import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccess, type ModuleKey, type Role } from '@/lib/permissions';

export interface Profile { id: string; full_name: string; email: string | null; role: Role; client_id: string | null; active: boolean }

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from('profiles').select('id, full_name, email, role, client_id, active').eq('id', data.user.id).single();
  return profile ? { user: data.user, profile: profile as Profile } : null;
});

export function flash(path: string, kind: 'ok' | 'err', message: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

/** Exige login e acesso ao módulo. Usar no topo de cada página/ação do módulo. */
export async function requireModule(key: ModuleKey) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.profile.active && s.profile.role === 'cliente' && s.profile.client_id) redirect('/cliente');
  if (!s.profile.active || s.profile.role === 'cliente') redirect('/sem-acesso');
  if (!canAccess(s.profile.role, key)) flash('/dashboard', 'err', 'Seu perfil não tem acesso a este módulo.');
  return { supabase: await createClient(), ...s };
}

/** Páginas do Portal do Cliente: exige usuário 'cliente' ativo e vinculado a uma empresa. */
export async function requirePortal() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.profile.role !== 'cliente') redirect('/dashboard');
  if (!s.profile.active || !s.profile.client_id) redirect('/sem-acesso');
  return { supabase: await createClient(), ...s };
}
