// Gera o link de acesso (login) de um cliente do portal. O link é de uso único e dá entrada + definição de senha.
// Regras: nunca converte um usuário da equipe em cliente; só reaproveita usuário que já é cliente DA MESMA empresa.
export interface AdminLike {
  auth: { admin: {
    createUser(a: { email: string; password: string; email_confirm: boolean; user_metadata?: Record<string, unknown> }): Promise<{ data: { user?: { id: string } | null } | null; error: { message: string } | null }>;
    updateUserById(id: string, a: { password: string }): Promise<{ error: { message: string } | null }>;
    generateLink(a: { type: 'invite' | 'recovery'; email: string; options?: { data?: Record<string, unknown> } }): Promise<{ data: { user?: { id: string } | null; properties?: { hashed_token?: string } | null } | null; error: { message: string } | null }>;
  } };
  from(t: 'profiles'): {
    select(c: string): { ilike(col: string, v: string): { maybeSingle(): Promise<{ data: { id: string; role: string; client_id: string | null; active: boolean; full_name: string | null } | null }> } };
    update(v: Record<string, unknown>): { eq(col: string, v: string): Promise<{ error: { message: string } | null }> };
  };
}
export type AccessResult =
  | { ok: true; mode: 'link'; link: string; kind: 'novo' | 'existente'; email: string; name: string }
  | { ok: true; mode: 'senha'; loginUrl: string; password: string; kind: 'novo' | 'existente'; email: string; name: string }
  | { ok: false; error: string };

/** Senha aleatória legível (sem caracteres que se confundem: 0/O, 1/l/I). 12 caracteres com maiúscula, minúscula e número. */
export function generatePassword(rand: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n): string {
  const up = 'ABCDEFGHJKLMNPQRSTUVWXYZ', low = 'abcdefghijkmnpqrstuvwxyz', num = '23456789', all = up + low + num;
  const pick = (set: string) => set[rand(set.length)];
  const chars = [pick(up), pick(low), pick(num), ...Array.from({ length: 9 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }   // embaralha
  return chars.join('');
}

const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f-]{36}$/;

export async function createClientAccess(admin: AdminLike, input: { email: string; name: string; clientId: string; base: string; mode?: 'link' | 'senha' }): Promise<AccessResult> {
  const email = input.email.trim().toLowerCase(); const name = input.name.trim().slice(0, 120);
  if (!MAIL.test(email)) return { ok: false, error: 'Informe um e-mail válido.' };
  if (!UUID.test(input.clientId)) return { ok: false, error: 'Escolha a empresa do cliente.' };
  if (name.length < 2) return { ok: false, error: 'Informe o nome da pessoa.' };

  const { data: prof } = await admin.from('profiles').select('id, role, client_id, active, full_name').ilike('email', email).maybeSingle();
  if (prof && prof.role !== 'cliente') return { ok: false, error: 'Este e-mail já é de um usuário da equipe Muvens. Use outro e-mail para o cliente.' };
  if (prof && prof.client_id && prof.client_id !== input.clientId) return { ok: false, error: 'Este e-mail já está vinculado a outra empresa. Ajuste em Configurações antes de gerar o link.' };

  if (input.mode === 'senha') {
    const password = generatePassword(); let uid = prof?.id;
    if (prof) { const r = await admin.auth.admin.updateUserById(prof.id, { password }); if (r.error) return { ok: false, error: 'Não foi possível definir a senha agora. Tente de novo.' }; }
    else { const r = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } }); uid = r.data?.user?.id; if (r.error || !uid) return { ok: false, error: 'Não foi possível criar o usuário agora. Se o e-mail já existir no login, peça o link em vez da senha.' }; }
    const { error } = await admin.from('profiles').update({ role: 'cliente', client_id: input.clientId, active: true, ...(prof?.full_name?.trim() ? {} : { full_name: name }) }).eq('id', uid!);
    if (error) return { ok: false, error: 'O usuário foi criado, mas não foi possível vincular à empresa. Vincule em Configurações.' };
    return { ok: true, mode: 'senha', kind: prof ? 'existente' : 'novo', email, name, password, loginUrl: `${input.base.replace(/\/$/, '')}/login` };
  }

  let type: 'invite' | 'recovery' = prof ? 'recovery' : 'invite';
  let res = await admin.auth.admin.generateLink({ type, email, options: { data: { full_name: name } } });
  if (res.error && type === 'invite') { type = 'recovery'; res = await admin.auth.admin.generateLink({ type, email }); }   // já existia no login e ainda não tinha perfil visível
  const token = res.data?.properties?.hashed_token; const uid = res.data?.user?.id ?? prof?.id;
  if (res.error || !token || !uid) return { ok: false, error: 'Não foi possível gerar o link agora. Confira se a chave de serviço do Supabase está configurada e tente de novo.' };

  const patch: Record<string, unknown> = { role: 'cliente', client_id: input.clientId, active: true };
  if (!prof?.full_name?.trim() || !prof) patch.full_name = name;
  const { error } = await admin.from('profiles').update(patch).eq('id', uid);
  if (error) return { ok: false, error: 'O link foi criado, mas não foi possível vincular o usuário à empresa. Vincule em Configurações.' };

  return { ok: true, mode: 'link', kind: prof ? 'existente' : 'novo', email, name, link: `${input.base.replace(/\/$/, '')}/auth/confirmar?token_hash=${encodeURIComponent(token)}&type=${type}` };
}
