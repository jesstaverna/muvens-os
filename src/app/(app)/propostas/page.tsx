import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty, Stat } from '@/components/ui';
import { dateBR, money } from '@/lib/format';
import { PROPOSAL_STATUS } from '@/lib/domain';

export const metadata = { title: 'Propostas' };

export default async function Propostas({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { supabase, profile } = await requireModule('propostas');
  const { status = '', q = '' } = await searchParams;
  const term = q.replace(/[%,()]/g, ' ').trim();
  let query = supabase.from('proposals').select('id, number, title, client_display_name, status, total_value, valid_until, sent_at, view_count, first_viewed_at').order('number', { ascending: false }).limit(300);
  if (status in PROPOSAL_STATUS) query = query.eq('status', status);
  if (term) query = query.or(`title.ilike.%${term}%,client_display_name.ilike.%${term}%`);
  const { data } = await query;
  const all = data ?? [];
  const open = all.filter((p) => ['enviada', 'visualizada', 'em_negociacao'].includes(p.status));
  const canCreate = profile.role === 'admin' || profile.role === 'comercial';

  return (
    <>
      <PageHeader title="Propostas Comerciais" subtitle="Cada proposta é uma página exclusiva com link próprio e aceite online." actions={canCreate ? <Link href="/propostas/nova" className="btn btn-primary">Nova proposta</Link> : undefined} />
      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Em aberto" value={open.length} hint={money(open.reduce((a, p) => a + Number(p.total_value), 0))} />
        <Stat label="Aceitas" value={all.filter((p) => p.status === 'aceita').length} hint={money(all.filter((p) => p.status === 'aceita').reduce((a, p) => a + Number(p.total_value), 0))} tone="lime" />
        <Stat label="Recusadas / expiradas" value={all.filter((p) => ['recusada', 'expirada'].includes(p.status)).length} />
      </section>
      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Buscar por título ou cliente" className="input max-w-sm" aria-label="Buscar" />
        <select name="status" defaultValue={status} className="input w-48" aria-label="Status"><option value="">Todos os status</option>{Object.entries(PROPOSAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className="btn btn-dark">Filtrar</button>
      </form>
      {!all.length ? <Empty title="Nenhuma proposta" text="Crie uma proposta a partir de um modelo ou direto de um lead no CRM." action={canCreate ? <Link href="/propostas/nova" className="btn btn-primary">Nova proposta</Link> : undefined} /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Nº</th><th className="th">Proposta</th><th className="th">Valor</th><th className="th">Validade</th><th className="th">Visualizações</th><th className="th">Status</th></tr></thead>
          <tbody>{all.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0 hover:bg-subtle/60"><td className="td text-muted">#{p.number}</td>
              <td className="td"><Link href={`/propostas/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs text-muted">{p.client_display_name}</div></td>
              <td className="td">{money(p.total_value)}</td><td className="td">{dateBR(p.valid_until)}</td><td className="td">{p.view_count || '—'}</td>
              <td className="td"><span className={`badge ${PROPOSAL_STATUS[p.status].tone}`}>{PROPOSAL_STATUS[p.status].label}</span></td></tr>))}</tbody></table></div>)}
    </>
  );
}
