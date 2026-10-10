import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { updateProject } from '../actions';
import { PRIORITY, PROJECT_STATUS, TASK_STATUS, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('projetos');
  const canWrite = ['admin', 'comercial', 'designer', 'trafego'].includes(profile.role);
  const [{ data: p }, { data: tasks }, { data: people }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', id).maybeSingle(),
    supabase.from('tasks').select('id, title, status, priority, due_on, out_of_scope, assignee:profiles!tasks_assignee_id_fkey(full_name)').eq('project_id', id).order('created_at'),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name'),
  ]);
  if (!p) notFound();
  const cl = Array.isArray(p.clients) ? p.clients[0] : p.clients; const today = todayBR();
  return (
    <>
      <PageHeader title={p.name} subtitle={`${cl?.name} · ${PROJECT_STATUS[p.status]}`} actions={<><Link href="/projetos?view=projetos" className="btn btn-sm">← Projetos</Link>{canWrite && <Link href={`/projetos/tarefas/nova?project=${id}`} className="btn btn-primary btn-sm">Nova tarefa</Link>}</>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2"><h2 className="mb-3 text-base font-semibold">Tarefas</h2>
          {!tasks?.length ? <Empty title="Sem tarefas" /> : (
            <div className="card overflow-x-auto !p-0"><table className="w-full"><tbody>{tasks.map((t: any) => { const a = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee; const late = t.due_on && t.due_on < today && !['entregue', 'aprovado', 'cancelada'].includes(t.status); return (
              <tr key={t.id} className="border-b border-line last:border-0 hover:bg-subtle/60"><td className="td"><Link href={`/projetos/tarefas/${t.id}`} className="font-medium hover:underline">{t.title}</Link>{t.out_of_scope && <span className="ml-2 badge border-amber-500/40 text-warn">fora do escopo</span>}</td>
                <td className="td text-muted">{a?.full_name ?? '—'}</td><td className={`td ${late ? 'font-medium text-danger' : ''}`}>{dateBR(t.due_on)}</td><td className={`td ${PRIORITY[t.priority].tone}`}>{PRIORITY[t.priority].label}</td><td className="td"><span className={`badge ${TASK_STATUS[t.status].tone}`}>{TASK_STATUS[t.status].label}</span></td></tr>); })}</tbody></table></div>)}</section>
        <form action={updateProject.bind(null, id)} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Dados do projeto</h2><fieldset disabled={!canWrite} className="space-y-4">
          <Field label="Nome"><input name="name" defaultValue={p.name} required className="input" /></Field>
          <Field label="Situação"><select name="status" defaultValue={p.status} className="input">{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Responsável"><select name="owner_id" defaultValue={p.owner_id ?? ''} className="input"><option value="">—</option>{people?.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Início"><input type="date" name="starts_on" defaultValue={p.starts_on ?? ''} className="input" /></Field><Field label="Prazo"><input type="date" name="due_on" defaultValue={p.due_on ?? ''} className="input" /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="client_visible" defaultChecked={p.client_visible} /> Visível no Portal do Cliente</label>
          <Field label="Observações"><textarea name="notes" rows={3} defaultValue={p.notes ?? ''} className="input" /></Field></fieldset>
          {canWrite && <SubmitButton>Salvar</SubmitButton>}{p.contract_id && <Link href={`/contratos/${p.contract_id}`} className="block text-sm underline">Ver contrato</Link>}</form>
      </div>
    </>
  );
}
