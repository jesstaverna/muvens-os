import { describe, expect, it } from 'vitest';
import { createClientAccess, type AdminLike } from './access';

const CLIENT = '11111111-1111-1111-1111-111111111111', OTHER = '99999999-9999-9999-9999-999999999999';
type P = { id: string; role: string; client_id: string | null; active: boolean; full_name: string | null };
function fake(profile: P | null, opts: { inviteFails?: boolean } = {}) {
  const calls: { type: string; email: string }[] = []; const patches: Record<string, unknown>[] = [];
  const admin: AdminLike = {
    auth: { admin: { generateLink: async (a) => { calls.push({ type: a.type, email: a.email }); if (a.type === 'invite' && opts.inviteFails) return { data: null, error: { message: 'already registered' } }; return { data: { user: { id: profile?.id ?? 'new-user' }, properties: { hashed_token: 'tok123' } }, error: null }; } } },
    from: () => ({ select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: profile }) }) }), update: (v) => ({ eq: async () => { patches.push(v); return { error: null }; } }) }),
  };
  return { admin, calls, patches };
}

describe('link de acesso do cliente', () => {
  it('usuário novo: convite, vincula à empresa e monta o link de confirmação', async () => {
    const f = fake(null); const r = await createClientAccess(f.admin, { email: ' Diego@PeaEditorial.com ', name: 'Diego Vogt', clientId: CLIENT, base: 'https://app.test/' });
    expect(r).toMatchObject({ ok: true, kind: 'novo', email: 'diego@peaeditorial.com' });
    expect(r.ok && r.link).toBe('https://app.test/auth/confirmar?token_hash=tok123&type=invite');
    expect(f.calls).toEqual([{ type: 'invite', email: 'diego@peaeditorial.com' }]);
    expect(f.patches[0]).toMatchObject({ role: 'cliente', client_id: CLIENT, active: true, full_name: 'Diego Vogt' });
  });
  it('cliente que já existe da mesma empresa: novo link (recuperação) e reativa', async () => {
    const f = fake({ id: 'u1', role: 'cliente', client_id: CLIENT, active: false, full_name: 'Diego' });
    const r = await createClientAccess(f.admin, { email: 'diego@x.com', name: 'Diego', clientId: CLIENT, base: 'https://app.test' });
    expect(r).toMatchObject({ ok: true, kind: 'existente' }); expect(r.ok && r.link).toContain('type=recovery'); expect(f.patches[0]).toMatchObject({ active: true });
  });
  it('convite recusado porque o login já existia: tenta recuperação', async () => {
    const f = fake(null, { inviteFails: true }); const r = await createClientAccess(f.admin, { email: 'a@b.co', name: 'Ana', clientId: CLIENT, base: 'https://app.test' });
    expect(r.ok && r.link).toContain('type=recovery'); expect(f.calls.map((c) => c.type)).toEqual(['invite', 'recovery']);
  });
  it('NUNCA transforma usuário da equipe em cliente e não mistura empresas', async () => {
    const staff = fake({ id: 's1', role: 'admin', client_id: null, active: true, full_name: 'Jessica' });
    expect(await createClientAccess(staff.admin, { email: 'j@x.com', name: 'Jessica', clientId: CLIENT, base: 'https://app.test' })).toMatchObject({ ok: false }); expect(staff.calls).toHaveLength(0); expect(staff.patches).toHaveLength(0);
    const other = fake({ id: 'u2', role: 'cliente', client_id: OTHER, active: true, full_name: 'X' });
    expect(await createClientAccess(other.admin, { email: 'x@x.com', name: 'X', clientId: CLIENT, base: 'https://app.test' })).toMatchObject({ ok: false }); expect(other.calls).toHaveLength(0);
  });
  it('valida e-mail, nome e empresa', async () => {
    const f = fake(null);
    for (const bad of [{ email: 'sem-arroba', name: 'Ana', clientId: CLIENT }, { email: 'a@b.co', name: ' ', clientId: CLIENT }, { email: 'a@b.co', name: 'Ana', clientId: 'x' }]) expect(await createClientAccess(f.admin, { ...bad, base: 'https://app.test' })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });
});
