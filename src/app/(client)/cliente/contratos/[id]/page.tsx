import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { PrintButton } from '@/components/ClientButtons';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Contrato', robots: { index: false } };
export default async function Contrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requirePortal();
  const { data, error } = await supabase.rpc('portal_contract', { p_id: id });
  if (error || !data) notFound();
  const c = data as { number: number; title: string; status: string; body: string };
  return (
    <>
      <div className="no-print mb-6 flex items-center justify-between"><LinkButton href="/cliente/contratos" className="btn btn-sm">← Voltar</LinkButton><PrintButton label="Imprimir / salvar PDF" /></div>
      <h1 className="h1 mb-6">Contrato #{c.number}</h1>
      <article className="card whitespace-pre-wrap font-serif text-[13px] leading-relaxed">{c.body}</article>
    </>
  );
}
