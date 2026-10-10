import { requirePortal } from '@/lib/session';
import { CLIENT_TASK_STATUS } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Calendário de entregas' };
type Project = { name: string; tasks: { id: string; title: string; status: string; due_on: string | null }[] };

export default async function Calendario() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_projects');
  const rows = ((data ?? []) as Project[]).flatMap((p) => p.tasks.filter((t) => t.due_on).map((t) => ({ ...t, project: p.name })));
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(r.due_on!, [...(byDay.get(r.due_on!) ?? []), r]);
  const days = [...byDay.keys()].sort();
  return (
    <>
      <h1 className="h1 mb-8">Calendário de entregas</h1>
      {!days.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhuma entrega com prazo definido.</div> : (
        <div className="space-y-4">{days.map((d) => (
          <section key={d} className="card !p-5"><h2 className="mb-3 text-sm font-semibold">{dateBR(d)}</h2>
            <ul className="space-y-2 text-sm">{byDay.get(d)!.map((t) => (<li key={t.id} className="flex items-center justify-between gap-3"><span>{t.title} <span className="text-xs text-muted">· {t.project}</span></span><span className={`badge ${CLIENT_TASK_STATUS[t.status]?.tone}`}>{CLIENT_TASK_STATUS[t.status]?.label}</span></li>))}</ul></section>))}</div>)}
    </>
  );
}
