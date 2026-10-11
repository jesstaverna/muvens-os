import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { PRIORITY, TASK_STATUS, monthRange, todayBR } from '@/lib/domain';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Calendário de Produção' };
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Calendario({ searchParams }: { searchParams: Promise<{ m?: string; client?: string; me?: string }> }) {
  const { supabase, profile } = await requireModule('calendario');
  const sp = await searchParams;
  const today = todayBR();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.m ?? '');
  const y = m ? Number(m[1]) : Number(today.slice(0, 4)), mo = m ? Math.min(Math.max(Number(m[2]), 1), 12) : Number(today.slice(5, 7));
  const { from, to } = monthRange(y, mo);
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`, nxt = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;

  let q = supabase.from('tasks').select('id, title, status, priority, due_on, assignee:profiles!tasks_assignee_id_fkey(full_name), projects!inner(name, client_id, clients(name))').gte('due_on', from).lte('due_on', to).neq('status', 'cancelada').order('due_on');
  if (sp.client && /^[0-9a-f-]{36}$/.test(sp.client)) q = q.eq('projects.client_id', sp.client);
  if (sp.me) q = q.eq('assignee_id', profile.id);
  const [{ data }, { data: clients }] = await Promise.all([q, supabase.from('clients').select('id, name').order('name')]);

  const byDay = new Map<string, NonNullable<typeof data>>();
  for (const t of data ?? []) byDay.set(t.due_on!, [...(byDay.get(t.due_on!) ?? []), t]);
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), last = Number(to.slice(8));
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => `${from.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  const keep = `${sp.client ? `&client=${sp.client}` : ''}${sp.me ? '&me=1' : ''}`;

  return (
    <>
      <PageHeader title="Calendário de Produção" subtitle={`${MONTHS[mo - 1]} de ${y} — prazos das tarefas`} actions={<><LinkButton href={`/calendario?m=${prev}${keep}`} className="btn btn-sm">← Anterior</LinkButton><LinkButton href={`/calendario${keep ? '?' + keep.slice(1) : ''}`} className="btn btn-sm">Hoje</LinkButton><LinkButton href={`/calendario?m=${nxt}${keep}`} className="btn btn-sm">Próximo →</LinkButton></>} />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2"><input type="hidden" name="m" value={`${y}-${String(mo).padStart(2, '0')}`} />
        <select name="client" defaultValue={sp.client ?? ''} className="input w-56" aria-label="Cliente"><option value="">Todos os clientes</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm"><input type="checkbox" name="me" value="1" defaultChecked={!!sp.me} /> Só minhas</label><button className="btn btn-dark">Filtrar</button></form>
      {!data?.length && <Empty title="Sem prazos neste mês" text="Tarefas com prazo definido aparecem aqui." />}
      <div className="hidden overflow-hidden rounded-2xl border border-line lg:block">
        <div className="grid grid-cols-7 border-b border-line bg-subtle text-center text-xs uppercase tracking-wider text-muted">{WD.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((d, i) => (
          <div key={i} className={`min-h-28 border-b border-r border-line p-2 ${d === today ? 'bg-lime/15' : ''}`}>{d && <><div className="mb-1 text-xs text-muted">{Number(d.slice(8))}</div>
            <ul className="space-y-1">{byDay.get(d)?.map((t) => { const done = ['entregue', 'aprovado'].includes(t.status); return (<li key={t.id}><Link href={`/projetos/tarefas/${t.id}`} className={`block truncate rounded-md px-1.5 py-0.5 text-[11px] ${done ? 'bg-lime/40' : d < today ? 'bg-danger/15 text-danger' : 'bg-subtle'}`} title={`${t.title} — ${one(one(t.projects)?.clients)?.name}`}>{t.title}</Link></li>); })}</ul></>}</div>))}</div>
      </div>
      <div className="space-y-4 lg:hidden">{[...byDay.keys()].sort().map((d) => (<section key={d} className="card !p-4"><h3 className="mb-2 text-sm font-semibold">{d.split('-').reverse().join('/')}</h3><ul className="space-y-2 text-sm">{byDay.get(d)!.map((t) => (<li key={t.id} className="flex justify-between gap-2"><Link href={`/projetos/tarefas/${t.id}`} className="underline">{t.title}</Link><span className={`badge ${TASK_STATUS[t.status].tone}`}>{TASK_STATUS[t.status].label}</span></li>))}</ul></section>))}</div>
      <p className="mt-4 text-xs text-muted">Legenda: verde = aprovada/entregue · vermelho = atrasada. Prioridades: {Object.values(PRIORITY).map((p) => p.label).join(', ')}.</p>
    </>
  );
}
