'use server';
import { appUrl } from '@/lib/app-url';
import { requireModule } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStaffAccess, type AdminLike } from '@/lib/portal/access';
import type { AccessState } from '../portal/access-action';

/** Cria o acesso de alguém da equipe (só administrador): link para criar a senha, ou login e senha gerados agora. Nada é guardado. */
export async function generateStaffAccess(_prev: AccessState, fd: FormData): Promise<AccessState> {
  const { profile } = await requireModule('configuracoes');
  if (profile.role !== 'admin') return { error: 'Somente administradores criam usuários da equipe.' };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: 'A chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) não está configurada na Vercel.' }; }
  try {
    const r = await createStaffAccess(admin as unknown as AdminLike, { email: String(fd.get('email') ?? ''), name: String(fd.get('name') ?? ''), role: String(fd.get('role') ?? ''), base: appUrl(), mode: fd.get('mode') === 'senha' ? 'senha' : 'link' });
    if (!r.ok) return { error: r.error };
    return r.mode === 'link' ? { ok: true, mode: 'link', link: r.link, name: r.name, email: r.email, kind: r.kind } : { ok: true, mode: 'senha', loginUrl: r.loginUrl, password: r.password, name: r.name, email: r.email, kind: r.kind };
  } catch { return { error: 'Não foi possível gerar o acesso agora. Tente de novo em instantes.' }; }
}
