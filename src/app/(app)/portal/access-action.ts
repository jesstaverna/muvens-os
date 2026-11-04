'use server';
import { appUrl } from '@/lib/app-url';
import { requireModule } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClientAccess, type AdminLike } from '@/lib/portal/access';

export type AccessState = { ok?: boolean; error?: string; mode?: 'link' | 'senha'; link?: string; loginUrl?: string; password?: string; name?: string; email?: string; kind?: 'novo' | 'existente' };

/** Gera o acesso de um usuário do cliente (só administrador): link para ele criar a senha, ou login e senha definidos agora. Nada é guardado: aparece uma vez na tela. */
export async function generateAccess(_prev: AccessState, fd: FormData): Promise<AccessState> {
  const { profile } = await requireModule('portal');
  if (profile.role !== 'admin') return { error: 'Somente administradores geram acessos de clientes.' };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: 'A chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) não está configurada na Vercel.' }; }
  try {
    const r = await createClientAccess(admin as unknown as AdminLike, { email: String(fd.get('email') ?? ''), name: String(fd.get('name') ?? ''), clientId: String(fd.get('client_id') ?? ''), base: appUrl(), mode: fd.get('mode') === 'senha' ? 'senha' : 'link' });
    if (!r.ok) return { error: r.error };
    return r.mode === 'link' ? { ok: true, mode: 'link', link: r.link, name: r.name, email: r.email, kind: r.kind } : { ok: true, mode: 'senha', loginUrl: r.loginUrl, password: r.password, name: r.name, email: r.email, kind: r.kind };
  } catch { return { error: 'Não foi possível gerar o link agora. Tente de novo em instantes.' }; }
}
