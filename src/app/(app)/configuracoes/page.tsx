import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { AccessForm } from '../portal/AccessForm';
import { appUrl } from '@/lib/app-url';
import { requireModule, flash } from '@/lib/session';
import { PageHeader, Field, Pending, Tabs } from '@/components/ui';
import { UserRow } from './UserRow';
import { removeUser } from './remove-user-action';
import { SubmitButton } from '@/components/SubmitButton';
import { ROLE_LABEL, type Role } from '@/lib/permissions';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Configurações' };

async function updateUser(id: string, fd: FormData) {
  'use server';
  const { supabase, profile } = await requireModule('configuracoes');
  const back = `/configuracoes?tab=${fd.get('tab') === 'clientes' ? 'clientes' : 'equipe'}`;
  const role = String(fd.get('role'));
  if (!(role in ROLE_LABEL)) flash(back, 'err', 'Perfil inválido.');
  const active = fd.get('active') === 'on';
  if (id === profile.id && (role !== 'admin' || !active)) flash(back, 'err', 'Você não pode remover seu próprio acesso de administrador.');
  const patch: Record<string, unknown> = { role, active, full_name: String(fd.get('full_name') ?? '').trim() };
  patch.client_id = role === 'cliente' ? String(fd.get('client_id') ?? '') || null : null;
  if (role === 'cliente' && !patch.client_id) flash(back, 'err', 'Para o perfil Cliente, escolha também a empresa em “Cliente (portal)”.');
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) flash(back, 'err', 'Não foi possível atualizar o usuário.');
  revalidatePath('/configuracoes');
  flash(back, 'ok', 'Usuário atualizado.');
}

async function saveStage(id: string | null, fd: FormData) {
  'use server';
  const { supabase } = await requireModule('configuracoes');
  const name = String(fd.get('name') ?? '').trim();
  if (!name) flash('/configuracoes?tab=funil', 'err', 'Informe o nome da etapa.');
  const row = { name, probability: Math.min(Math.max(Number(fd.get('probability') ?? 0) || 0, 0), 100), position: Number(fd.get('position') ?? 0) || 0, active: fd.get('active') === 'on' };
  const kind = String(fd.get('kind') ?? 'open');
  const q = id ? supabase.from('pipeline_stages').update(row).eq('id', id) : supabase.from('pipeline_stages').insert({ ...row, kind: ['open', 'won', 'lost'].includes(kind) ? kind : 'open', is_negotiation: false });
  const { error } = await q;
  if (error) flash('/configuracoes?tab=funil', 'err', error.code === '23505' ? 'Já existe uma etapa ativa nessa posição — use um número livre.' : 'Não foi possível salvar a etapa.');
  revalidatePath('/crm');
  flash('/configuracoes?tab=funil', 'ok', 'Etapa salva.');
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

const TABS = ['equipe', 'clientes', 'funil', 'integracoes', 'auditoria'] as const;

export default async function Config({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams; const tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? sp.tab! : 'equipe';
  const { supabase, profile } = await requireModule('configuracoes');
  const [{ data: users }, { data: stages }, { data: clients }, { data: audit }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, active, client_id, created_at').order('created_at'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('audit_log').select('id, table_name, action, created_at, actor_id').order('created_at', { ascending: false }).limit(15),
  ]);
  const names = new Map(users?.map((u) => [u.id, u.full_name || u.email]));
  const staff = (users ?? []).filter((u) => u.role !== 'cliente'), people = (users ?? []).filter((u) => u.role === 'cliente');
  const roleOpts = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const company = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const byCompany = [...new Set(people.map((u) => u.client_id ?? ''))].map((cid) => ({ cid, name: company.get(cid) ?? 'Sem empresa vinculada', list: people.filter((u) => (u.client_id ?? '') === cid) })).sort((a, b) => a.name.localeCompare(b.name));
  const tabs = [
    { key: 'equipe', label: `Equipe (${staff.length})`, href: '/configuracoes?tab=equipe' }, { key: 'clientes', label: `Clientes do portal (${people.length})`, href: '/configuracoes?tab=clientes' },
    { key: 'funil', label: 'Funil comercial', href: '/configuracoes?tab=funil' }, { key: 'integracoes', label: 'Integrações', href: '/configuracoes?tab=integracoes' }, { key: 'auditoria', label: 'Auditoria', href: '/configuracoes?tab=auditoria' },
  ];
  return (
    <>
      <PageHeader title="Configurações" subtitle="Equipe e permissões, clientes do portal, funil comercial, integrações e auditoria." />
      <Tabs current={tab} items={tabs} />

      {tab === 'equipe' && (
        <div className="space-y-6">
          {profile.role === 'admin' && <AccessForm variant="equipe" loginUrl={`${appUrl().replace(/\/$/, '')}/login`} roles={roleOpts.filter((r) => r.value !== 'cliente')} />}
          <section className="card"><h2 className="mb-1 text-base font-semibold">Equipe Muvens</h2>
            <p className="mb-5 text-sm text-muted">Ajuste nome, perfil e situação de cada pessoa. Quem tem o perfil <b>Cliente</b> aparece na aba <b>Clientes do portal</b>.</p>
            <div className="space-y-3">{staff.map((u) => <UserRow key={u.id} user={u} clients={clients ?? []} roles={roleOpts} action={updateUser.bind(null, u.id)} removeAction={profile.role === 'admin' ? removeUser.bind(null, u.id) : undefined} tab="equipe" self={u.id === profile.id} />)}</div></section>
        </div>)}

      {tab === 'clientes' && (
        <section className="card"><div className="mb-1 flex flex-wrap items-start justify-between gap-3"><h2 className="text-base font-semibold">Clientes do portal</h2><Link href="/portal?tab=acessos" className="btn btn-sm btn-primary">Criar acesso / gerar link</Link></div>
          <p className="mb-5 text-sm text-muted">Pessoas de empresas clientes. Elas só enxergam o portal (projetos liberados). Para criar um novo acesso, use <b>Portal do Cliente › Acessos</b>. <b>Atenção:</b> o perfil Administrador dá acesso a tudo; pessoas de clientes devem ter o perfil <b>Cliente</b> com a empresa escolhida.</p>
          {!people.length ? <p className="text-sm text-muted">Nenhum usuário de cliente ainda.</p> : (
            <div className="space-y-6">{byCompany.map((g) => (<div key={g.cid || 'sem'}><h3 className="mb-2 text-sm font-semibold">{g.name} <span className="font-normal text-muted">· {g.list.length} {g.list.length === 1 ? 'usuário' : 'usuários'}</span></h3>
              <div className="space-y-3">{g.list.map((u) => <UserRow key={u.id} user={u} clients={clients ?? []} roles={roleOpts} action={updateUser.bind(null, u.id)} removeAction={profile.role === 'admin' ? removeUser.bind(null, u.id) : undefined} tab="clientes" self={false} />)}</div></div>))}</div>)}
        </section>)}

      {tab === 'funil' && (
      <section className="card"><h2 className="mb-1 text-base font-semibold">Etapas do funil</h2>
        <p className="mb-5 text-sm text-muted">Renomeie, reordene (posição única entre etapas ativas) e ajuste a probabilidade usada nas previsões. As probabilidades iniciais são estimativas suas para calibrar — não são dados históricos.</p>
        <div className="space-y-2">{stages?.map((s) => (
          <form key={s.id} action={saveStage.bind(null, s.id)} className={`grid items-end gap-3 sm:grid-cols-[1fr_6rem_6rem_auto_auto] ${s.active ? '' : 'opacity-60'}`}>
            <Field label={`${s.kind === 'won' ? 'Ganho' : s.kind === 'lost' ? 'Perdido' : 'Aberta'}${s.is_negotiation ? ' · negociação' : ''}`}><input name="name" defaultValue={s.name} className="input" /></Field>
            <Field label="Posição"><input name="position" type="number" defaultValue={s.position} className="input" /></Field><Field label="Prob. %"><input name="probability" type="number" min={0} max={100} defaultValue={s.probability} className="input" /></Field>
            <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Ativa</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>))}</div>
        <form action={saveStage.bind(null, null)} className="mt-6 grid items-end gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_6rem_6rem_8rem_auto_auto]"><Field label="Nova etapa"><input name="name" required className="input" /></Field><Field label="Posição"><input name="position" type="number" defaultValue={((stages?.at(-1)?.position ?? 0) + 1)} className="input" /></Field><Field label="Prob. %"><input name="probability" type="number" defaultValue={30} className="input" /></Field>
          <Field label="Tipo"><select name="kind" className="input"><option value="open">Aberta</option><option value="won">Ganho</option><option value="lost">Perdido</option></select></Field><input type="hidden" name="active" value="on" /><SubmitButton className="btn btn-sm btn-dark" pendingText="…">Adicionar</SubmitButton></form></section>
      )}

      {tab === 'integracoes' && (
      <section className="card"><h2 className="mb-4 text-base font-semibold">Integrações</h2>
        <p className="mb-4 text-sm text-muted">Nenhuma integração externa está conectada. Cada linha abaixo está <b>pendente</b>; o sistema só marcará como ativa após uma chamada real bem-sucedida.</p>
        <ul className="divide-y divide-line">{INTEGRATIONS.map((i) => <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><div className="font-medium">{i.name}</div><div className="text-xs text-muted">{i.need}</div></div><span className="flex gap-2"><span className="badge">{i.phase}</span><Pending>Pendente</Pending></span></li>)}</ul></section>
      )}

      {tab === 'auditoria' && (
      <section className="card"><h2 className="mb-4 text-base font-semibold">Auditoria recente</h2>
        <table className="w-full text-sm"><tbody>{audit?.map((a) => <tr key={a.id} className="border-b border-line last:border-0"><td className="py-2 text-muted">{dateTimeBR(a.created_at)}</td><td className="py-2">{a.action} em <code>{a.table_name}</code></td><td className="py-2 text-right text-muted">{a.actor_id ? names.get(a.actor_id) ?? 'usuário' : 'sistema'}</td></tr>)}</tbody></table>
        <p className="mt-3 text-xs text-muted">Logado: {profile.email}. A trilha completa fica na tabela <code>audit_log</code> (somente administradores).</p></section>
      )}
    </>
  );
}
