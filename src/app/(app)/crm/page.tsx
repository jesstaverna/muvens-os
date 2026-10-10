import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Empty, Tabs } from '@/components/ui';
import { KanbanBoard, type KLead } from './KanbanBoard';
import { dateBR, dateTimeBR, money, pct, relativeDays } from '@/lib/format';
import { monthRange, todayBR } from '@/lib/domain';

export const metadata = { title: 'CRM e Leads' };
type SP = { view?: string; q?: string; owner?: string };

export default async function CRM({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase } = await requireModule('crm');
  const sp = await searchParams;
  const view = ['kanban', 'lista', 'calendario'].includes(sp.view ?? '') ? sp.view! : 'kanban';
  const [y, m] = todayBR().split('-').map(Number);
  const { from, to } = monthRange(y, m);

  const q = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
  let query = supabase.from('leads').select('id, name, company, whatsapp, phone, email, source, service_interest, potential_value, stage_id, owner:profiles!leads_owner_id_fkey(full_name), owner_id, last_contact_at, created_at, next_action, next_action_at, pipeline_stages(name, kind)').order('created_at', { ascending: false }).limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`);
  if (sp.owner) query = query.eq('owner_id', sp.owner);

  const [{ data: stages }, { data: leads }, { data: conv }, { data: owners }, { data: reminders }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, kind').eq('active', true).order('position'),
    query,
    supabase.rpc('crm_conversion', { p_from: from, p_to: to }),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial']).eq('active', true),
    supabase.from('lead_reminders').select('id, title, due_at, lead_id, leads(name)').is('done_at', null).order('due_at').limit(50),
  ]);

  const now = new Date();
  const k: KLead[] = (leads ?? []).map((l) => {
    const d = relativeDays(l.last_contact_at ?? l.created_at, now) ?? 0;
    const owner = Array.isArray(l.owner) ? l.owner[0] : l.owner;
    return { id: l.id, name: l.name, company: l.company, potential_value: Number(l.potential_value), owner: owner?.full_name ?? null, stage_id: l.stage_id, daysSinceContact: d, stale: d >= 3 };
  });
  const c = (conv ?? {}) as Record<string, number>;
  const stale = k.filter((l) => l.stale && stages?.find((s) => s.id === l.stage_id)?.kind === 'open').length;
  const href = (v: string) => `/crm?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  // agenda: próximas ações + lembretes agrupados por dia
  const agenda = new Map<string, { when: string; label: string; lead: string; id: string }[]>();
  for (const l of leads ?? []) if (l.next_action_at && l.next_action) {
    const day = l.next_action_at.slice(0, 10); (agenda.get(day) ?? agenda.set(day, []).get(day)!).push({ when: l.next_action_at, label: l.next_action, lead: l.name, id: l.id });
  }
  for (const r of reminders ?? []) {
    const day = r.due_at.slice(0, 10); const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
    (agenda.get(day) ?? agenda.set(day, []).get(day)!).push({ when: r.due_at, label: `Lembrete: ${r.title}`, lead: lead?.name ?? '', id: r.lead_id });
  }
  const days = [...agenda.keys()].sort();

  return (
    <>
      <PageHeader title="CRM e Leads" subtitle="Funil comercial da Muvens." actions={<><Link href="/configuracoes#funil" className="btn">Personalizar etapas</Link><Link href="/crm/novo" className="btn btn-primary">Novo lead</Link></>} />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Leads no mês" value={c.total ?? 0} />
        <Stat label="Taxa de conversão (mês)" value={c.total ? pct((c.won / c.total) * 100) : '—'} hint={`${c.won ?? 0} fechados · ${c.lost ?? 0} perdidos · ${c.open ?? 0} abertos`} />
        <Stat label="Valor fechado (mês)" value={money(c.won_value)} />
        <Stat label="Sem acompanhamento" value={stale} tone={stale ? 'danger' : undefined} hint="Abertos há 3+ dias sem contato" />
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs current={view} items={[{ key: 'kanban', label: 'Kanban', href: href('kanban') }, { key: 'lista', label: 'Lista', href: href('lista') }, { key: 'calendario', label: 'Calendário', href: href('calendario') }]} />
        <form method="get" className="mb-6 flex gap-2"><input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} placeholder="Buscar nome, empresa, e-mail" className="input w-64" aria-label="Buscar leads" />
          <select name="owner" defaultValue={sp.owner ?? ''} className="input w-44" aria-label="Responsável"><option value="">Todos</option>{owners?.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</select>
          <button className="btn btn-dark">Filtrar</button></form>
      </div>

      {!k.length ? (
        <Empty title={q || sp.owner ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'} text="Cadastre o primeiro lead manualmente. Quando o RD Station/RD Conversas for conectado (Fase 3), os leads chegam automaticamente." action={<Link href="/crm/novo" className="btn btn-primary">Novo lead</Link>} />
      ) : view === 'kanban' ? (
        <KanbanBoard stages={(stages ?? []) as { id: string; name: string; kind: 'open' | 'won' | 'lost' }[]} leads={k} />
      ) : view === 'lista' ? (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full"><thead><tr className="border-b border-line"><th className="th">Lead</th><th className="th">Etapa</th><th className="th">Serviço</th><th className="th">Origem</th><th className="th">Valor</th><th className="th">Responsável</th><th className="th">Último contato</th></tr></thead>
            <tbody>{(leads ?? []).map((l) => {
              const st = Array.isArray(l.pipeline_stages) ? l.pipeline_stages[0] : l.pipeline_stages; const ow = Array.isArray(l.owner) ? l.owner[0] : l.owner;
              return (<tr key={l.id} className="border-b border-line last:border-0 hover:bg-subtle/60">
                <td className="td"><Link href={`/crm/${l.id}`} className="font-medium hover:underline">{l.name}</Link><div className="text-xs text-muted">{l.company}</div></td>
                <td className="td"><span className="badge">{st?.name}</span></td><td className="td">{l.service_interest ?? '—'}</td><td className="td">{l.source ?? '—'}</td>
                <td className="td">{money(l.potential_value)}</td><td className="td">{ow?.full_name ?? '—'}</td><td className="td whitespace-nowrap">{l.last_contact_at ? dateBR(l.last_contact_at) : 'Nunca'}</td></tr>);
            })}</tbody></table>
        </div>
      ) : (
        days.length ? (
          <div className="space-y-4">{days.map((d) => (
            <section key={d} className="card !p-5"><h3 className="mb-3 text-sm font-semibold">{dateBR(d)}</h3>
              <ul className="space-y-2">{agenda.get(d)!.sort((a, b) => a.when.localeCompare(b.when)).map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm"><span><span className="text-muted">{dateTimeBR(e.when).slice(-5)}</span> — {e.label}</span><Link href={`/crm/${e.id}`} className="underline">{e.lead}</Link></li>))}</ul></section>))}</div>
        ) : <Empty title="Agenda vazia" text="Defina a próxima ação ou crie lembretes nos leads para vê-los aqui." />
      )}
    </>
  );
}
