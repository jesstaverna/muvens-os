'use client';
import { useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';

type U = { id: string; email: string | null; full_name: string | null; role: string; active: boolean; client_id: string | null };

/** Linha de usuário: a empresa só aparece quando o perfil é "Cliente" (nos outros perfis ela é ignorada). */
export function UserRow({ user, clients, roles, action, tab, self }: { user: U; clients: { id: string; name: string }[]; roles: { value: string; label: string }[]; action: (fd: FormData) => Promise<void>; tab: string; self: boolean }) {
  const [role, setRole] = useState(user.role);
  return (
    <form action={action} className={`rounded-xl border border-line p-3 ${user.active ? '' : 'opacity-60'}`}>
      <input type="hidden" name="tab" value={tab} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-medium">{user.email}</div>{self && <div className="text-xs text-muted">Você</div>}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} /> Ativo</label></div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_11rem_1.3fr_auto]">
        <label className="block"><span className="label">Nome</span><input name="full_name" defaultValue={user.full_name ?? ''} className="input" /></label>
        <label className="block"><span className="label">Perfil</span><select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="input">{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
        {role === 'cliente' ? <label className="block"><span className="label">Empresa do cliente</span><select name="client_id" defaultValue={user.client_id ?? ''} required className="input"><option value="" disabled>Escolha…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <div className="hidden lg:block" />}
        <SubmitButton className="btn btn-sm btn-dark" pendingText="…">Salvar</SubmitButton>
      </div>
      {role === 'administrador' || role === 'admin' ? <p className="mt-2 text-xs text-warn">Administrador vê tudo: financeiro, propostas e todos os clientes.</p> : null}
    </form>
  );
}
