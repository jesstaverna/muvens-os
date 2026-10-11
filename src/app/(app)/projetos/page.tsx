import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Tabs, Empty, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TaskBoard, type KTask } from './TaskBoard';
import { createPlan, saveRate } from './actions';
import { PRIORITY, PROJECT_STATUS, TASK_STATUS, fmtMinutes, todayBR } from '@/lib/domain';
import { dateBR, money } from '@/lib/format';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Projetos e Tarefas' };
type SP = { view?: string; client?: string; project?: string; me?: string; m?: string };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Projetos({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireModule('projetos');
  const sp = await searchParams;
  const views = ['kanban', 'lista', 'projetos', 'entregaveis', ...(['admin', 'financeiro'].includes(profile.role) ? ['rentabilidade'] : [])];
  const view = views.includes(sp.view ?? '') ? sp.view! : 'kanban';
  const today = todayBR();
  const canWrite = ['admin', 'comercial', 'designer', 'trafego'].includes(profile.role);
  const canPlan = profile.role === 'admin' || profile.role === 'comercial';

  const [{ data: clients }, { data: projects }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('projects').select('id, name, status, due_on, client_id, clients(name), owner:profiles!projects_owner_id_fkey(full_name)').order('created_at', { ascending: false }),
  ]);

  let tq = supabase.from('tasks').select('id, title, status, priority, due_on, out_of_scope, project_id, assignee_id, assignee:profiles!tasks_assignee_id_fkey(full_name), projects!inner(name, client_id, clients(name))').neq('status', 'cancelada').order('due_on', { ascending: true, nullsFirst: false }).limit(1000);
  if (sp.project && /^[0-9a-f-]{36}$/.test(sp.project)) tq = tq.eq('project_id', sp.project);
  if (sp.client && /^[0-9a-f-]{36}$/.test(sp.client)) tq = tq.eq('projects.client_id', sp.client);
  if (sp.me) tq = tq.eq('assignee_id', profile.id);
  const { data: tasksRaw } = view === 'projetos' || view === 'entregaveis' || view === 'rentabilidade' ? { data: [] as never[] } : await tq;

  const tasks: KTask[] = (tasksRaw ?? []).map((t: any) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, due_on: t.due_on, assignee: one(t.assignee)?.full_name ?? null,
    client: one(one(t.projects)?.clients)?.name ?? null, project: one(t.projects)?.name ?? null, out_of_scope: t.out_of_scope,
    late: !!t.due_on && t.due_on < today && !['entregue', 'aprovado'].includes(t.status),
  }));

  const qs = (extra: Record<string, string>) => { const p = new URLSearchParams({ ...(sp.client ? { client: sp.client } : {}), ...(sp.project ? { project: sp.project } : {}), ...(sp.me ? { me: '1' } : {}), ...extra }); return `/projetos?${p}`; };
  const TABS = [{ key: 'kanban', label: 'Kanban' }, { key: 'lista', label: 'Lista' }, { key: 'projetos', label: 'Projetos por cliente' }, { key: 'entregaveis', label: 'Entregáveis contratados' }, ...(views.includes('rentabilidade') ? [{ key: 'rentabilidade', label: 'Rentabilidade' }] : [])];
  const late = tasks.filter((t) => t.late).length;

  return (
    <>
      <PageHeader title="Projetos e Tarefas" subtitle="Produção por cliente, com fluxo de aprovação, entregáveis e controle de horas."
        actions={canWrite ? <><LinkButton href="/projetos/novo" className="btn">Novo projeto</LinkButton><LinkButton href="/projetos/tarefas/nova" className="btn btn-primary">Nova tarefa</LinkButton></> : undefined} />
      <Tabs current={view} items={TABS.map((t) => ({ ...t, href: `/projetos?view=${t.key}` }))} />

      {(view === 'kanban' || view === 'lista') && (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2"><input type="hidden" name="view" value={view} />
            <select name="client" defaultValue={sp.client ?? ''} className="input w-52" aria-label="Cliente"><option value="">Todos os clientes</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select name="project" defaultValue={sp.project ?? ''} className="input w-60" aria-label="Projeto"><option value="">Todos os projetos</option>{projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <label className="flex items-center gap-2 px-2 pb-2.5 text-sm"><input type="checkbox" name="me" value="1" defaultChecked={!!sp.me} /> Só minhas</label>
            <button className="btn btn-dark">Filtrar</button>{late > 0 && <span className="pb-2.5 text-sm text-danger">{late} atrasada(s)</span>}</form>
          {!tasks.length ? <Empty title="Nenhuma tarefa" text="Crie um projeto para o cliente e adicione tarefas. Ao assinar um contrato, o projeto de onboarding é criado automaticamente." action={canWrite ? <LinkButton href="/projetos/tarefas/nova" className="btn btn-primary">Nova tarefa</LinkButton> : undefined} />
            : view === 'kanban' ? <TaskBoard tasks={tasks} /> : (
              <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Tarefa</th><th className="th">Cliente / projeto</th><th className="th">Responsável</th><th className="th">Prazo</th><th className="th">Prioridade</th><th className="th">Status</th></tr></thead>
                <tbody>{tasks.map((t) => (<tr key={t.id} className="border-b border-line last:border-0 hover:bg-subtle/60"><td className="td"><Link className="font-medium hover:underline" href={`/projetos/tarefas/${t.id}`}>{t.title}</Link>{t.out_of_scope && <span className="ml-2 badge border-amber-500/40 text-warn">fora do escopo</span>}</td>
                  <td className="td text-muted">{t.client}<div className="text-xs">{t.project}</div></td><td className="td">{t.assignee ?? '—'}</td><td className={`td whitespace-nowrap ${t.late ? 'font-medium text-danger' : ''}`}>{dateBR(t.due_on)}</td>
                  <td className={`td ${PRIORITY[t.priority].tone}`}>{PRIORITY[t.priority].label}</td><td className="td"><span className={`badge ${TASK_STATUS[t.status].tone}`}>{TASK_STATUS[t.status].label}</span></td></tr>))}</tbody></table></div>)}
        </>)}

      {view === 'projetos' && (!projects?.length ? <Empty title="Nenhum projeto" action={canWrite ? <LinkButton href="/projetos/novo" className="btn btn-primary">Novo projeto</LinkButton> : undefined} /> : (
        <div className="space-y-8">{[...new Set(projects.map((p) => p.client_id))].map((cid) => {
          const list = projects.filter((p) => p.client_id === cid); const cname = one(list[0].clients)?.name;
          return (<section key={cid}><h2 className="mb-3 text-base font-semibold"><Link href={`/clientes/${cid}`} className="hover:underline">{cname}</Link></h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((p) => (<Link key={p.id} href={`/projetos/${p.id}`} className="card block !p-5 transition hover:bg-subtle/60"><div className="font-medium">{p.name}</div>
              <div className="mt-1 text-xs text-muted">{PROJECT_STATUS[p.status]}{p.due_on ? ` · prazo ${dateBR(p.due_on)}` : ''}</div><div className="mt-3 text-xs text-muted">{one(p.owner)?.full_name ?? 'Sem responsável'}</div></Link>))}</div></section>);
        })}</div>))}

      {view === 'entregaveis' && <Entregaveis supabase={supabase} clients={clients ?? []} projects={projects ?? []} canPlan={canPlan} />}
      {view === 'rentabilidade' && <Rentabilidade supabase={supabase} />}
    </>
  );
}

async function Entregaveis({ supabase, clients, projects, canPlan }: { supabase: Awaited<ReturnType<typeof requireModule>>['supabase']; clients: { id: string; name: string }[]; projects: { id: string; name: string }[]; canPlan: boolean }) {
  const { data } = await supabase.from('deliverable_progress').select('*').order('period_month', { ascending: false }).limit(200);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {!data?.length ? <Empty title="Nenhum entregável contratado" text="Cadastre, por exemplo, “12 posts de Instagram” para um cliente em um mês. As tarefas ligadas a ele mostram o andamento e o que passar da quantidade vira “fora do escopo”." /> :
          data.map((d) => (
            <div key={d.id} className="card"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><div className="font-medium">{d.name}</div><div className="text-xs text-muted">{names.get(d.client_id)} · {String(d.period_month).slice(5, 7)}/{String(d.period_month).slice(0, 4)}</div></div><div className="text-sm"><b>{d.entregues}</b> de {d.quantity} entregues</div></div>
              <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">{[['Iniciados', d.iniciados], ['Produzidos', d.produzidos], ['Enviados', d.enviados], ['Aprovados', d.aprovados], ['Entregues', d.entregues]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-subtle p-2.5"><div className="text-lg font-semibold">{v}<span className="text-xs font-normal text-muted">/{d.quantity}</span></div><div className="text-muted">{l}</div></div>))}</div>
              {d.fora_escopo > 0 && <p className="mt-3 rounded-lg bg-amber-500/15 p-2.5 text-xs text-warn">{d.fora_escopo} tarefa(s) fora do escopo contratado — orçar à parte.</p>}</div>))}
      </div>
      {canPlan ? (
        <form action={createPlan} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Novo entregável contratado</h2>
          <Field label="Cliente"><select name="client_id" required className="input"><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Projeto (opcional)"><select name="project_id" className="input"><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Entregável"><input name="name" required placeholder="Posts de Instagram" className="input" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Mês"><input type="month" name="period_month" required className="input" /></Field><Field label="Quantidade"><input type="number" name="quantity" min={1} required className="input" /></Field></div>
          <SubmitButton>Salvar</SubmitButton></form>) : <p className="text-sm text-muted">Somente administrador ou comercial define entregáveis contratados.</p>}
    </div>);
}

async function Rentabilidade({ supabase }: { supabase: Awaited<ReturnType<typeof requireModule>>['supabase'] }) {
  const today = todayBR(); const from = `${today.slice(0, 7)}-01`;
  const [{ data: rows }, { data: people }, { data: rates }] = await Promise.all([
    supabase.rpc('client_profitability', { p_from: from, p_to: today }),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name'),
    supabase.from('staff_rates').select('user_id, hourly_cost'),
  ]);
  const rate = new Map(rates?.map((r) => [r.user_id, Number(r.hourly_cost)]));
  const noRate = (rows ?? []).reduce((a: number, r: any) => a + Number(r.minutes_without_rate), 0);
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <p className="text-sm text-muted">Mês atual ({dateBR(from)} a {dateBR(today)}): receita recebida − horas apontadas × custo/hora. Não inclui impostos, ferramentas nem outros custos.</p>
        {noRate > 0 && <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-warn">{fmtMinutes(noRate)} de horas sem custo/hora definido — a margem está superestimada.</p>}
        {!rows?.length ? <Empty title="Sem dados no mês" text="Aparecem clientes com recebimentos ou horas apontadas no período." /> : (
          <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Recebido</th><th className="th">Horas</th><th className="th">Custo de equipe</th><th className="th">Margem</th></tr></thead>
            <tbody>{rows.map((r: any) => (<tr key={r.client_id} className="border-b border-line last:border-0"><td className="td font-medium">{r.client_name}</td><td className="td">{money(r.received)}</td><td className="td">{fmtMinutes(Number(r.minutes))}</td><td className="td">{money(r.labor_cost)}</td><td className={`td font-medium ${Number(r.margin) < 0 ? 'text-danger' : ''}`}>{money(r.margin)}</td></tr>))}</tbody></table></div>)}
      </div>
      <div className="card h-fit"><h2 className="mb-4 text-base font-semibold">Custo por hora da equipe</h2>
        <div className="space-y-3">{people?.map((p) => (<form key={p.id} action={saveRate} className="flex items-end gap-2"><input type="hidden" name="user_id" value={p.id} /><div className="flex-1"><span className="label">{p.full_name}</span><input name="hourly_cost" inputMode="decimal" defaultValue={rate.has(p.id) ? String(rate.get(p.id)).replace('.', ',') : ''} placeholder="R$/hora" className="input" aria-label={`Custo por hora de ${p.full_name}`} /></div><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>))}</div></div>
    </div>);
}
