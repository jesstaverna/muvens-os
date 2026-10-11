import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { ProposalView, type ProposalViewData } from '@/components/ProposalView';
import { PrintButton } from '@/components/ClientButtons';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Pré-visualização', robots: { index: false } };

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireModule('propostas');
  const [{ data: p }, { data: items }] = await Promise.all([
    supabase.from('proposals').select('*').eq('id', id).maybeSingle(),
    supabase.from('proposal_items').select('*').eq('proposal_id', id).order('position'),
  ]);
  if (!p) notFound();
  const data: ProposalViewData = { ...p, client_name: p.client_display_name, discount_value: Number(p.discount_value), subtotal_one_time: Number(p.subtotal_one_time), subtotal_monthly: Number(p.subtotal_monthly), total_value: Number(p.total_value),
    items: (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) })) };
  return (
    <div className="-mx-4 -mt-20 sm:-mx-6 lg:-mx-10 lg:-mt-6">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg px-6 py-3 text-sm">
        <LinkButton href={`/propostas/${id}`} className="btn btn-sm">← Voltar ao editor</LinkButton>
        <span className="text-muted">Pré-visualização interna — {p.status === 'rascunho' ? 'ainda não enviada' : 'versão atual'}</span>
        <PrintButton />
      </div>
      <ProposalView p={data} />
    </div>
  );
}
