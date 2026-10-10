import { requirePortal } from '@/lib/session';
import { CLIENT_TASK_STATUS, PROJECT_STATUS } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Projetos' };
type Task = { id: string; title: string; status: string; due_on: string | null };
type Project = { id: string; name: string; status: string; due_on: string | null; tasks: Task[] };

export default async function Projetos() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_projects');
  const projects = (data ?? []) as Project[];
  return (
    <>
      <h1 className="h1 mb-8">Projetos</h1>
      {!projects.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Ainda não há projetos compartilhados com você.</div> : (
        <div className="space-y-6">{projects.map((p) => {
          const done = p.tasks.filter((t) => ['aprovado', 'entregue'].includes(t.status)).length;
          const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
          return (
            <section key={p.id} className="card"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">{p.name}</h2><span className="text-xs text-muted">{PROJECT_STATUS[p.status]}{p.due_on ? ` · prazo ${dateBR(p.due_on)}` : ''}</span></div>
              <div className="my-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} /></div><span className="text-xs text-muted">{done}/{p.tasks.length} concluídas</span></div>
              <ul className="divide-y divide-line">{p.tasks.map((t) => (<li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{t.title}</span><span className="flex items-center gap-3"><span className="text-xs text-muted">{t.due_on ? dateBR(t.due_on) : ''}</span><span className={`badge ${CLIENT_TASK_STATUS[t.status]?.tone}`}>{CLIENT_TASK_STATUS[t.status]?.label}</span></span></li>))}</ul></section>);
        })}</div>)}
    </>
  );
}
