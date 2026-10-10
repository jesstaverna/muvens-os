import { revalidatePath } from 'next/cache';
import { requireModule, flash } from '@/lib/session';
import { PageHeader, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { ROLE_LABEL, type Role } from '@/lib/permissions';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Configurações' };

async function updateUser(id: string, fd: FormData) {
  'use server';
  const { supabase, profile } = await requireModule('configuracoes');
  const role = String(fd.get('role'));
  if (!(role in ROLE_LABEL)) flash('/configuracoes', 'err', 'Perfil inválido.');
  const active = fd.get('active') === 'on';
  if (id === profile.id && (role !== 'admin' || !active)) flash('/configuracoes', 'err', 'Você não pode remover seu próprio acesso de administrador.');
  const patch: Record<string, unknown> = { role, active, full_name: String(fd.get('full_name') ?? '').trim() };
  patch.client_id = role === 'cliente' ? String(fd.get('client_id') ?? '') || null : null;
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) flash('/configuracoes', 'err', 'Não foi possível atualizar o usuário.');
  revalidatePath('/configuracoes');
  flash('/configuracoes', 'ok', 'Usuário atualizado.');
}

async function saveStage(id: string | null, fd: FormData) {
  'use server';
  const { supabase } = await requireModule('configuracoes');
  const name = String(fd.get('name') ?? '').trim();
  if (!name) flash('/configuracoes#funil', 'err', 'Informe o nome da etapa.');
  const row = { name, probability: Math.min(Math.max(Number(fd.get('probability') ?? 0) || 0, 0), 100), position: Number(fd.get('position') ?? 0) || 0, active: fd.get('active') === 'on' };
  const kind = String(fd.get('kind') ?? 'open');
  const q = id ? supabase.from('pipeline_stages').update(row).eq('id', id) : supabase.from('pipeline_stages').insert({ ...row, kind: ['open', 'won', 'lost'].includes(kind) ? kind : 'open', is_negotiation: false });
  const { error } = await q;
  if (error) flash('/configuracoes#funil', 'err', error.code === '23505' ? 'Já existe uma etapa ativa nessa posição — use um número livre.' : 'Não foi possível salvar a etapa.');
  revalidatePath('/crm');
  flash('/configuracoes#funil', 'ok', 'Etapa salva.');
}

const INTEGRATIONS = [
  { name: 'RD Station Marketing', phase: 'Fase 3', need: 'Conta + credenciais OAuth (client id/secret) no plano contratado' },
  { name: 'RD Conversas (agente de IA no WhatsApp)', phase: 'Fase 3', need: 'Assinatura do RD Conversas — ainda não contratada. Nada simulado.' },
  { name: 'Clicksign / ZapSign (assinatura)', phase: 'Fase 3', need: 'Conta e token de API' },
  { name: 'Meta Ads', phase: 'Fase 3', need: 'App Meta + token com acesso às contas de anúncio dos clientes' },
  { name: 'Google Ads', phase: 'Fase 3', need: 'Developer token + OAuth' },
  { name: 'Asaas (cobrança)', phase: 'Fase 3', need: 'Chave de API (sandbox para homologação)' },
  { name: 'Claude API (MUVENS AI)', phase: 'Fase 4', need: 'ANTHROPIC_API_KEY no servidor' },
];

export default async function Config() {
  const { supabase, profile } = await requireModule('configuracoes');
  const [{ data: users }, { data: stages }, { data: clients }, { data: audit }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, active, client_id, created_at').order('created_at'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('audit_log').select('id, table_name, action, created_at, actor_id').order('created_at', { ascending: false }).limit(15),
  ]);
  const names = new Map(users?.map((u) => [u.id, u.full_name || u.email]));
  return (
    <>
      <PageHeader title="Configurações" subtitle="Usuários e permissões, funil comercial, integrações e auditoria." />

      <section className="card mb-8"><h2 className="mb-1 text-base font-semibold">Usuários e perfis</h2>
        <p className="mb-5 text-sm text-muted">Crie o usuário no Supabase Auth (convite por e-mail) e defina o perfil aqui. Novos cadastros entram <b>sem acesso</b> até você liberar. Contas “Cliente” só terão portal na Fase 2.</p>
        <div className="space-y-3">{users?.map((u) => (
          <form key={u.id} action={updateUser.bind(null, u.id)} className="grid items-end gap-3 rounded-xl border border-line p-3 md:grid-cols-[1.2fr_1.2fr_11rem_1fr_auto_auto]">
            <div><span className="label">E-mail</span><div className="truncate text-sm">{u.email}</div></div>
            <Field label="Nome"><input name="full_name" defaultValue={u.full_name} className="input" /></Field>
            <Field label="Perfil"><select name="role" defaultValue={u.role} className="input">{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Field label="Cliente (portal)"><select name="client_id" defaultValue={u.client_id ?? ''} className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Ativo</label>
            <SubmitButton className="btn btn-sm btn-dark" pendingText="…">Salvar</SubmitButton>
          </form>))}</div></section>

      <section id="funil" className="card mb-8"><h2 className="mb-1 text-base font-semibold">Etapas do funil</h2>
        <p className="mb-5 text-sm text-muted">Renomeie, reordene (posição única entre etapas ativas) e ajuste a probabilidade usada nas previsões. As probabilidades iniciais são estimativas suas para calibrar — não são dados históricos.</p>
        <div className="space-y-2">{stages?.map((s) => (
          <form key={s.id} action={saveStage.bind(null, s.id)} className={`grid items-end gap-3 sm:grid-cols-[1fr_6rem_6rem_auto_auto] ${s.active ? '' : 'opacity-60'}`}>
            <Field label={`${s.kind === 'won' ? 'Ganho' : s.kind === 'lost' ? 'Perdido' : 'Aberta'}${s.is_negotiation ? ' · negociação' : ''}`}><input name="name" defaultValue={s.name} className="input" /></Field>
            <Field label="Posição"><input name="position" type="number" defaultValue={s.position} className="input" /></Field><Field label="Prob. %"><input name="probability" type="number" min={0} max={100} defaultValue={s.probability} className="input" /></Field>
            <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Ativa</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>))}</div>
        <form action={saveStage.bind(null, null)} className="mt-6 grid items-end gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_6rem_6rem_8rem_auto_auto]"><Field label="Nova etapa"><input name="name" required className="input" /></Field><Field label="Posição"><input name="position" type="number" defaultValue={((stages?.at(-1)?.position ?? 0) + 1)} className="input" /></Field><Field label="Prob. %"><input name="probability" type="number" defaultValue={30} className="input" /></Field>
          <Field label="Tipo"><select name="kind" className="input"><option value="open">Aberta</option><option value="won">Ganho</option><option value="lost">Perdido</option></select></Field><input type="hidden" name="active" value="on" /><SubmitButton className="btn btn-sm btn-dark" pendingText="…">Adicionar</SubmitButton></form></section>

      <section className="card mb-8"><h2 className="mb-4 text-base font-semibold">Integrações</h2>
        <p className="mb-4 text-sm text-muted">Nenhuma integração externa está conectada. Cada linha abaixo está <b>pendente</b>; o sistema só marcará como ativa após uma chamada real bem-sucedida.</p>
        <ul className="divide-y divide-line">{INTEGRATIONS.map((i) => <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><div className="font-medium">{i.name}</div><div className="text-xs text-muted">{i.need}</div></div><span className="flex gap-2"><span className="badge">{i.phase}</span><Pending>Pendente</Pending></span></li>)}</ul></section>

      <section className="card"><h2 className="mb-4 text-base font-semibold">Auditoria recente</h2>
        <table className="w-full text-sm"><tbody>{audit?.map((a) => <tr key={a.id} className="border-b border-line last:border-0"><td className="py-2 text-muted">{dateTimeBR(a.created_at)}</td><td className="py-2">{a.action} em <code>{a.table_name}</code></td><td className="py-2 text-right text-muted">{a.actor_id ? names.get(a.actor_id) ?? 'usuário' : 'sistema'}</td></tr>)}</tbody></table>
        <p className="mt-3 text-xs text-muted">Logado: {profile.email}. A trilha completa fica na tabela <code>audit_log</code> (somente administradores).</p></section>
    </>
  );
}
