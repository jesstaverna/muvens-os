import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Empty } from '@/components/ui';
import { dateBR, money } from '@/lib/format';
import { CONTRACT_STATUS, todayBR } from '@/lib/domain';

export const metadata = { title: 'Contratos' };

export default async function Contratos({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, profile } = await requireModule('contratos');
  const { status = '' } = await searchParams;
  let q = supabase.from('contracts').select('id, number, title, status, total_value, starts_on, ends_on, client_id, clients(name)').order('number', { ascending: false }).limit(300);
  if (status in CONTRACT_STATUS) q = q.eq('status', status);
  const [{ data }, { data: accepted }] = await Promise.all([q, supabase.from('proposals').select('id, number, title, client_display_name').eq('status', 'aceita').order('number', { ascending: false })]);
  const all = data ?? [];
  const today = todayBR(), in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const withContract = new Set((await supabase.from('contracts').select('proposal_id').neq('status', 'cancelado')).data?.map((c) => c.proposal_id));
  const pending = (accepted ?? []).filter((p) => !withContract.has(p.id));
  const expiring = all.filter((c) => c.status === 'assinado' && c.ends_on && c.ends_on >= today && c.ends_on <= in30);
  return (
    <>
      <PageHeader title="Contratos" subtitle="Rascunho gerado ao aceitar a proposta → revisão humana obrigatória → assinatura → cliente ativo e financeiro." actions={<>{profile.role === 'admin' || profile.role === 'comercial' ? <Link href="/contratos/modelos" className="btn">Modelos e dados da agência</Link> : null}</>} />
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Em revisão / rascunho" value={all.filter((c) => ['rascunho', 'em_revisao'].includes(c.status)).length} />
        <Stat label="Aprovados (aguardando assinatura)" value={all.filter((c) => ['aprovado', 'enviado_assinatura'].includes(c.status)).length} />
        <Stat label="Assinados" value={all.filter((c) => c.status === 'assinado').length} tone="lime" />
        <Stat label="Vencem em 30 dias" value={expiring.length} tone={expiring.length ? 'danger' : undefined} />
      </section>
      {!!pending.length && <div className="card mb-6 border-amber-500/40"><h2 className="mb-2 text-base font-semibold">Propostas aceitas sem contrato</h2><ul className="space-y-1 text-sm">{pending.map((p) => <li key={p.id}><Link className="underline" href={`/propostas/${p.id}`}>#{p.number} · {p.title}</Link> — {p.client_display_name}</li>)}</ul></div>}
      <form method="get" className="mb-5 flex gap-2"><select name="status" defaultValue={status} className="input w-56" aria-label="Status"><option value="">Todos os status</option>{Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select><button className="btn btn-dark">Filtrar</button></form>
      {!all.length ? <Empty title="Nenhum contrato" text="Contratos aparecem aqui quando uma proposta é aceita (rascunho automático) ou quando você gera um manualmente na proposta." /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Nº</th><th className="th">Contrato</th><th className="th">Valor</th><th className="th">Vigência</th><th className="th">Status</th></tr></thead>
          <tbody>{all.map((c) => { const cl = Array.isArray(c.clients) ? c.clients[0] : c.clients; return (
            <tr key={c.id} className="border-b border-line last:border-0 hover:bg-subtle/60"><td className="td text-muted">#{c.number}</td><td className="td"><Link href={`/contratos/${c.id}`} className="font-medium hover:underline">{c.title}</Link><div className="text-xs text-muted">{cl?.name}</div></td>
              <td className="td">{money(c.total_value)}</td><td className="td">{c.starts_on ? `${dateBR(c.starts_on)} → ${dateBR(c.ends_on)}` : '—'}</td><td className="td"><span className={`badge ${CONTRACT_STATUS[c.status].tone}`}>{CONTRACT_STATUS[c.status].label}</span></td></tr>); })}</tbody></table></div>)}
    </>
  );
}
