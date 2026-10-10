import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { LeadForm } from '../LeadForm';
import { addInteraction, addReminder, completeReminder, updateLead } from '../actions';
import { dateTimeBR, money } from '@/lib/format';
import { PROPOSAL_STATUS } from '@/lib/domain';

const KIND: Record<string, string> = { nota: 'Nota', ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', sistema: 'Sistema' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireModule('crm');
  const [{ data: lead }, { data: stages }, { data: owners }, { data: inter }, { data: rem }, { data: props }] = await Promise.all([
    supabase.from('leads').select('*, pipeline_stages(name, kind)').eq('id', id).maybeSingle(),
    supabase.from('pipeline_stages').select('id, name').eq('active', true).order('position'),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial']).eq('active', true),
    supabase.from('lead_interactions').select('id, kind, content, created_at, profiles(full_name)').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('lead_reminders').select('id, title, due_at, done_at').eq('lead_id', id).order('due_at'),
    supabase.from('proposals').select('id, number, title, status, total_value').eq('lead_id', id).order('number', { ascending: false }),
  ]);
  if (!lead) notFound();
  const st = Array.isArray(lead.pipeline_stages) ? lead.pipeline_stages[0] : lead.pipeline_stages;

  return (
    <>
      <PageHeader title={lead.name} subtitle={`${lead.company ?? 'Sem empresa'} · etapa: ${st?.name}${lead.lost_reason ? ` · motivo da perda: ${lead.lost_reason}` : ''}`}
        actions={<>
          <Link href="/crm" className="btn">← Funil</Link>
          {lead.client_id && <Link href={`/clientes/${lead.client_id}`} className="btn">Ver cliente</Link>}
          <Link href={`/propostas/nova?lead=${lead.id}`} className="btn btn-primary">Criar proposta</Link>
        </>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2"><h2 className="mb-5 text-base font-semibold">Dados do lead</h2>
          <LeadForm action={updateLead.bind(null, id)} stages={stages ?? []} owners={owners ?? []} lead={lead} submitLabel="Salvar alterações" /></div>

        <div className="space-y-6">
          <section className="card"><h2 className="mb-4 text-base font-semibold">Propostas vinculadas</h2>
            {props?.length ? <ul className="space-y-2.5">{props.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm"><Link href={`/propostas/${p.id}`} className="hover:underline">#{p.number} · {p.title}</Link>
                <span className="flex items-center gap-2"><span className="text-muted">{money(p.total_value)}</span><span className={`badge ${PROPOSAL_STATUS[p.status]?.tone}`}>{PROPOSAL_STATUS[p.status]?.label}</span></span></li>))}</ul>
              : <p className="text-sm text-muted">Nenhuma proposta ainda.</p>}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Lembretes</h2>
            <ul className="mb-4 space-y-2">{rem?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm"><span className={r.done_at ? 'text-muted line-through' : ''}>{r.title}<span className="block text-xs text-muted">{dateTimeBR(r.due_at)}</span></span>
                {!r.done_at && <form action={completeReminder.bind(null, id, r.id)}><button className="btn btn-sm">Concluir</button></form>}</li>))}
              {!rem?.length && <li className="text-sm text-muted">Sem lembretes.</li>}</ul>
            <form action={addReminder.bind(null, id)} className="space-y-3"><Field label="Título"><input name="title" required className="input" /></Field><Field label="Quando"><input type="datetime-local" name="due_at" required className="input" /></Field>
              <SubmitButton className="btn btn-sm" pendingText="…">Criar lembrete</SubmitButton></form></section>
        </div>

        <section className="card xl:col-span-3"><h2 className="mb-5 text-base font-semibold">Histórico de contato</h2>
          <form action={addInteraction.bind(null, id)} className="mb-6 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
            <select name="kind" className="input" aria-label="Tipo">{Object.entries(KIND).filter(([k]) => k !== 'sistema').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input name="content" required placeholder="O que aconteceu neste contato?" className="input" aria-label="Conteúdo" />
            <SubmitButton pendingText="…">Registrar</SubmitButton></form>
          {inter?.length ? <ol className="space-y-4 border-l border-line pl-5">{inter.map((i) => {
            const p = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
            return <li key={i.id} className="relative text-sm"><span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-lime ring-2 ring-bg" />
              <div className="text-xs text-muted">{KIND[i.kind]} · {dateTimeBR(i.created_at)}{p?.full_name ? ` · ${p.full_name}` : ''}</div><div className="mt-0.5">{i.content}</div></li>;
          })}</ol> : <Empty title="Sem registros" text="Registre ligações, mensagens e reuniões. Contatos por WhatsApp/e-mail/ligação atualizam o “último contato”." />}
        </section>
      </div>
    </>
  );
}
