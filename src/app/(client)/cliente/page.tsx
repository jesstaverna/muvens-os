import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { Stat } from '@/components/ui';
import { CLIENT_TASK_STATUS } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Portal do Cliente' };
type Deadline = { id: string; title: string; due_on: string; status: string; project: string };

export default async function Inicio() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_overview');
  const o = (data ?? {}) as { client_name: string; projects_active: number; awaiting_approval: number; open_requests: number; next_deadlines: Deadline[] };
  return (
    <>
      <h1 className="h1">Olá, {o.client_name}</h1>
      <p className="mt-1.5 text-sm text-muted">Acompanhe projetos, aprove peças e fale com a equipe Muvens.</p>
      <section className="my-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Aguardando sua aprovação" value={o.awaiting_approval} tone={o.awaiting_approval ? 'lime' : undefined} href="/cliente/aprovacoes" />
        <Stat label="Projetos em andamento" value={o.projects_active} href="/cliente/projetos" />
        <Stat label="Solicitações abertas" value={o.open_requests} href="/cliente/solicitacoes" />
      </section>
      <section className="card"><h2 className="mb-4 text-base font-semibold">Próximas entregas</h2>
        {!o.next_deadlines?.length ? <p className="text-sm text-muted">Nenhuma entrega com prazo definido no momento.</p> : (
          <ul className="divide-y divide-line">{o.next_deadlines.map((d) => (<li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.project}</div></div>
            <div className="text-right"><div>{dateBR(d.due_on)}</div><span className={`badge ${CLIENT_TASK_STATUS[d.status]?.tone}`}>{CLIENT_TASK_STATUS[d.status]?.label}</span></div></li>))}</ul>)}
        <Link href="/cliente/calendario" className="mt-4 inline-block text-sm underline">Ver calendário completo</Link></section>
    </>
  );
}
