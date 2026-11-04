import { describe, expect, it } from 'vitest';
import { createClientAccess, createStaffAccess, generatePassword, type AdminLike } from './access';

const CLIENT = '11111111-1111-1111-1111-111111111111', OTHER = '99999999-9999-9999-9999-999999999999';
type P = { id: string; role: string; client_id: string | null; active: boolean; full_name: string | null };
function fake(profile: P | null, opts: { inviteFails?: boolean } = {}) {
  const calls: { type: string; email: string }[] = []; const patches: Record<string, unknown>[] = []; const created: { email: string; password: string }[] = []; const resets: { id: string; password: string }[] = [];
  const admin: AdminLike = {
    auth: { admin: { createUser: async (a) => { created.push({ email: a.email, password: a.password }); return { data: { user: { id: 'created-1' } }, error: null }; }, updateUserById: async (id, a) => { resets.push({ id, password: a.password }); return { error: null }; }, generateLink: async (a) => { calls.push({ type: a.type, email: a.email }); if (a.type === 'invite' && opts.inviteFails) return { data: null, error: { message: 'already registered' } }; return { data: { user: { id: profile?.id ?? 'new-user' }, properties: { hashed_token: 'tok123' } }, error: null }; } } },
    from: () => ({ select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: profile }) }) }), update: (v) => ({ eq: async () => { patches.push(v); return { error: null }; } }) }),
  };
  return { admin, calls, patches, created, resets };
}

describe('link de acesso do cliente', () => {
  it('usuário novo: convite, vincula à empresa e monta o link de confirmação', async () => {
    const f = fake(null); const r = await createClientAccess(f.admin, { email: ' Diego@PeaEditorial.com ', name: 'Diego Vogt', clientId: CLIENT, base: 'https://app.test/' });
    expect(r).toMatchObject({ ok: true, kind: 'novo', email: 'diego@peaeditorial.com' });
    expect(r.ok && r.mode === 'link' && r.link).toBe('https://app.test/auth/confirmar?token_hash=tok123&type=invite');
    expect(f.calls).toEqual([{ type: 'invite', email: 'diego@peaeditorial.com' }]);
    expect(f.patches[0]).toMatchObject({ role: 'cliente', client_id: CLIENT, active: true, full_name: 'Diego Vogt' });
  });
  it('cliente que já existe da mesma empresa: novo link (recuperação) e reativa', async () => {
    const f = fake({ id: 'u1', role: 'cliente', client_id: CLIENT, active: false, full_name: 'Diego' });
    const r = await createClientAccess(f.admin, { email: 'diego@x.com', name: 'Diego', clientId: CLIENT, base: 'https://app.test' });
    expect(r).toMatchObject({ ok: true, kind: 'existente' }); expect(r.ok && r.mode === 'link' && r.link).toContain('type=recovery'); expect(f.patches[0]).toMatchObject({ active: true });
  });
  it('convite recusado porque o login já existia: tenta recuperação', async () => {
    const f = fake(null, { inviteFails: true }); const r = await createClientAccess(f.admin, { email: 'a@b.co', name: 'Ana', clientId: CLIENT, base: 'https://app.test' });
    expect(r.ok && r.mode === 'link' && r.link).toContain('type=recovery'); expect(f.calls.map((c) => c.type)).toEqual(['invite', 'recovery']);
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
  it('modo login e senha: cria o usuário com senha forte já confirmado e vincula', async () => {
    const f = fake(null); const r = await createClientAccess(f.admin, { email: 'Ana@Cliente.com', name: 'Ana Souza', clientId: CLIENT, base: 'https://app.test/', mode: 'senha' });
    expect(r).toMatchObject({ ok: true, mode: 'senha', kind: 'novo', email: 'ana@cliente.com', loginUrl: 'https://app.test/login' });
    expect(f.created).toHaveLength(1); expect(r.ok && r.mode === 'senha' && r.password).toBe(f.created[0].password); expect(f.calls).toHaveLength(0);
    expect(f.patches[0]).toMatchObject({ role: 'cliente', client_id: CLIENT, active: true, full_name: 'Ana Souza' });
  });
  it('modo senha para cliente existente: redefine a senha (mesma empresa) e nunca toca em equipe', async () => {
    const f = fake({ id: 'u9', role: 'cliente', client_id: CLIENT, active: true, full_name: 'Ana' });
    const r = await createClientAccess(f.admin, { email: 'ana@x.com', name: 'Ana', clientId: CLIENT, base: 'https://app.test', mode: 'senha' });
    expect(r).toMatchObject({ ok: true, kind: 'existente' }); expect(f.resets).toHaveLength(1); expect(f.resets[0].id).toBe('u9'); expect(f.created).toHaveLength(0);
    const staff = fake({ id: 's1', role: 'comercial', client_id: null, active: true, full_name: 'Caio' });
    expect(await createClientAccess(staff.admin, { email: 'c@x.com', name: 'Caio', clientId: CLIENT, base: 'https://app.test', mode: 'senha' })).toMatchObject({ ok: false }); expect(staff.resets).toHaveLength(0);
  });
  it('gera senhas fortes e diferentes', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(set.size).toBeGreaterThan(45);
    for (const p of set) { expect(p).toHaveLength(12); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[0-9]/); expect(p).not.toMatch(/[0OIl1]/); }
  });
  it('equipe nova: cria com o perfil escolhido, sem empresa', async () => {
    const f = fake(null); const r = await createStaffAccess(f.admin, { email: 'Dani@Muvens.com.br', name: 'Dani Designer', role: 'designer', base: 'https://app.test/' });
    expect(r).toMatchObject({ ok: true, mode: 'link', kind: 'novo' }); expect(f.patches[0]).toMatchObject({ role: 'designer', client_id: null, active: true, full_name: 'Dani Designer' });
  });
  it('equipe existente: só reativa, NUNCA troca o perfil; cliente não vira equipe', async () => {
    const adm = fake({ id: 'a1', role: 'admin', client_id: null, active: true, full_name: 'Jessica' });
    expect(await createStaffAccess(adm.admin, { email: 'j@x.com', name: 'Jessica', role: 'designer', base: 'https://app.test', mode: 'senha' })).toMatchObject({ ok: true, kind: 'existente' });
    expect(adm.patches[0]).toEqual({ active: true }); expect(adm.resets).toHaveLength(1);
    const cli = fake({ id: 'c1', role: 'cliente', client_id: CLIENT, active: true, full_name: 'Diego' });
    expect(await createStaffAccess(cli.admin, { email: 'd@x.com', name: 'Diego', role: 'comercial', base: 'https://app.test' })).toMatchObject({ ok: false }); expect(cli.calls).toHaveLength(0); expect(cli.patches).toHaveLength(0);
  });
  it('perfil de equipe inválido é recusado (inclusive "cliente")', async () => {
    const f = fake(null);
    for (const role of ['cliente', 'root', '']) expect(await createStaffAccess(f.admin, { email: 'a@b.co', name: 'Ana', role, base: 'https://app.test' })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0); expect(f.created).toHaveLength(0);
  });
});
