import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { dateBR, money } from '@/lib/format';
import { PROPOSAL_STATUS } from '@/lib/domain';

export const metadata = { title: 'Propostas e contratos' };
type P = { number: number; title: string; status: string; total_value: number; valid_until: string | null; token: string };
type C = { id: string; number: number; title: string; status: string; starts_on: string | null; ends_on: string | null; signed_at: string | null };

export default async function PropostasContratos() {
  const { supabase } = await requirePortal();
  const [{ data: p }, { data: c }] = await Promise.all([supabase.rpc('portal_proposals'), supabase.rpc('portal_contracts')]);
  const proposals = (p ?? []) as P[], contracts = (c ?? []) as C[];
  return (
    <>
      <h1 className="h1 mb-8">Propostas e contratos</h1>
      <section className="mb-10"><h2 className="mb-3 text-base font-semibold">Propostas</h2>
        {!proposals.length ? <p className="text-sm text-muted">Nenhuma proposta.</p> : <div className="card divide-y divide-line !p-0">{proposals.map((x) => (
          <div key={x.number} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium">#{x.number} · {x.title}</div><div className="text-xs text-muted">{money(x.total_value)}{x.valid_until ? ` · válida até ${dateBR(x.valid_until)}` : ''}</div></div>
            <div className="flex items-center gap-2"><span className={`badge ${PROPOSAL_STATUS[x.status]?.tone}`}>{PROPOSAL_STATUS[x.status]?.label}</span><a className="btn btn-sm" href={`/p/${x.token}`} target="_blank" rel="noreferrer">Abrir</a></div></div>))}</div>}</section>
      <section><h2 className="mb-3 text-base font-semibold">Contratos</h2>
        {!contracts.length ? <p className="text-sm text-muted">Nenhum contrato disponível.</p> : <div className="card divide-y divide-line !p-0">{contracts.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium">#{x.number} · {x.title}</div><div className="text-xs text-muted">{x.status === 'assinado' ? `Assinado em ${dateBR(x.signed_at)} · vigência ${dateBR(x.starts_on)} a ${dateBR(x.ends_on)}` : 'Aguardando assinatura'}</div></div>
            <Link className="btn btn-sm" href={`/cliente/contratos/${x.id}`}>Ver contrato</Link></div>))}</div>}</section>
    </>
  );
}
