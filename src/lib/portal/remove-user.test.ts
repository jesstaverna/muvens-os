import { describe, expect, it } from 'vitest';
import { removalBlocked, removeUserAccess, type RemoveAdminLike } from './remove-user';

function fake(opts: { deleteFails?: boolean; banFails?: boolean } = {}) {
  const log: string[] = [];
  const admin: RemoveAdminLike = {
    auth: { admin: { deleteUser: async () => { log.push('delete'); return { error: opts.deleteFails ? { message: 'fk' } : null }; }, updateUserById: async () => { log.push('ban'); return { error: opts.banFails ? { message: 'x' } : null }; } } },
    from: () => ({ update: (v) => ({ eq: async () => { log.push('desativa:' + JSON.stringify(v)); return { error: null }; } }) }),
  };
  return { admin, log };
}

describe('remover usuário', () => {
  it('apaga o login e antes desativa o perfil', async () => { const f = fake(); expect(await removeUserAccess(f.admin, 'u1')).toEqual({ ok: true, mode: 'apagado' }); expect(f.log).toEqual(['desativa:{"active":false}', 'delete']); });
  it('com histórico (não dá para apagar): fica desativado e bloqueado', async () => { const f = fake({ deleteFails: true }); expect(await removeUserAccess(f.admin, 'u1')).toEqual({ ok: true, mode: 'desativado' }); expect(f.log).toEqual(['desativa:{"active":false}', 'delete', 'ban']); });
  it('avisa se não conseguiu bloquear o login', async () => expect(await removeUserAccess(fake({ deleteFails: true, banFails: true }).admin, 'u1')).toMatchObject({ ok: false }));
  it('não remove a si mesmo nem o último administrador', () => {
    expect(removalBlocked({ self: true, targetRole: 'admin', targetActive: true, otherActiveAdmins: 3 })).toMatch(/próprio/);
    expect(removalBlocked({ self: false, targetRole: 'admin', targetActive: true, otherActiveAdmins: 0 })).toMatch(/último administrador/);
    expect(removalBlocked({ self: false, targetRole: 'admin', targetActive: true, otherActiveAdmins: 1 })).toBeNull();
    expect(removalBlocked({ self: false, targetRole: 'cliente', targetActive: true, otherActiveAdmins: 0 })).toBeNull();
    expect(removalBlocked({ self: false, targetRole: 'admin', targetActive: false, otherActiveAdmins: 0 })).toBeNull();
  });
});
